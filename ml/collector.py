"""
Live Network Flow Collector
Captures packets from a network interface, groups them into flows,
computes the same 20 CICIDS2017 features, and runs IsolationForest detection.

Requirements:
  - Windows: Npcap installed (https://npcap.com), run Flask as Administrator
  - Linux/Mac: run as root or with CAP_NET_RAW
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import time
import socket
import ipaddress
import threading
from concurrent.futures import ThreadPoolExecutor
import numpy as np

from ml.oui import vendor_from_mac

try:
    from scapy.all import sniff, get_if_list, conf
    from scapy.layers.inet import IP, TCP, UDP, ICMP
    from scapy.layers.l2 import Ether
    from scapy.layers.dns import DNS, DNSRR
    from scapy.layers.dhcp import DHCP, BOOTP
    SCAPY_AVAILABLE = True
except Exception:
    SCAPY_AVAILABLE = False


# ── Passive DNS cache (IP → hostname) ─────────────────────────────────────────
# The sniffer sees the DNS *responses* the device receives just before it
# connects somewhere (e.g. `g.whatsapp.net` → 157.240.x.x). Caching those
# answers names destinations whose TLS handshake carries no parseable SNI —
# QUIC/HTTP-3, WhatsApp's Noise protocol, raw-IP flows. DoH/DoT lookups are
# encrypted and invisible to this; those flows keep the SNI-or-IP fallback.
_DNS_CACHE_MAX = 4096
_dns_cache: dict[str, str] = {}
_dns_lock = threading.Lock()


def _cache_dns_response(dns):
    """Record answer-IP → queried-name from a DNS response packet."""
    try:
        if not dns.qr or not dns.ancount or dns.qd is None:
            return
        # Scapy ≥2.6 exposes qd/an as lists; older versions chain packets
        # via .payload. Normalise both to plain lists.
        qd = dns.qd
        if isinstance(qd, list):
            if not qd:
                return
            qd = qd[0]
        qname = qd.qname
        if isinstance(qname, bytes):
            qname = qname.decode("ascii", "ignore")
        qname = qname.rstrip(".").lower()
        if not qname:
            return

        an = dns.an
        if isinstance(an, list):
            answers = an
        else:
            answers, rr = [], an
            while isinstance(rr, DNSRR):
                answers.append(rr)
                rr = rr.payload

        with _dns_lock:
            for rr in answers:
                if rr.type in (1, 28):        # A / AAAA
                    ip = rr.rdata
                    if isinstance(ip, bytes):
                        ip = ip.decode("ascii", "ignore")
                    if ip:
                        # Map to the ORIGINAL query name (what the app asked
                        # for), not a CNAME-chain intermediate.
                        if len(_dns_cache) >= _DNS_CACHE_MAX:
                            _dns_cache.pop(next(iter(_dns_cache)))
                        _dns_cache[str(ip)] = qname
    except Exception:
        pass  # malformed DNS must never break capture


def dns_hostname(ip: str):
    """Hostname previously resolved to this IP, or None."""
    with _dns_lock:
        return _dns_cache.get(ip)


# ── Device-name cache (DHCP option-12 / mDNS .local → device hostname) ─────────
# Names the DEVICE (not the destination): a DHCP request carries the client's
# own hostname ("Johns-Laptop"), and mDNS announces "Johns-iPhone.local". Keyed
# by both IP and MAC so detect() can identify the source device. Complements the
# MAC-OUI vendor lookup in ml/oui.py.
_DEVICE_CACHE_MAX = 4096
_device_names: dict[str, str] = {}
_device_lock = threading.Lock()


def _norm_mac(mac: str) -> str:
    return "".join(c for c in mac.lower() if c in "0123456789abcdef") if mac else ""


def _trim(cache: dict):
    while len(cache) > _DEVICE_CACHE_MAX:
        cache.pop(next(iter(cache)))


def _cache_dhcp(pkt):
    """Map client MAC/IP → hostname from a DHCP packet's option 12."""
    try:
        hostname, req_ip = None, None
        for opt in pkt[DHCP].options:
            if isinstance(opt, tuple) and opt[0] == "hostname":
                hn = opt[1]
                hostname = hn.decode("ascii", "ignore") if isinstance(hn, bytes) else str(hn)
            elif isinstance(opt, tuple) and opt[0] == "requested_addr":
                req_ip = str(opt[1])
        if not hostname:
            return
        hostname = hostname.strip().rstrip(".")
        mac    = pkt[Ether].src if pkt.haslayer(Ether) else None
        yiaddr = pkt[BOOTP].yiaddr if pkt.haslayer(BOOTP) else None
        with _device_lock:
            if mac:
                _device_names[_norm_mac(mac)] = hostname
            for ip in (req_ip, yiaddr):
                if ip and ip != "0.0.0.0":
                    _device_names[str(ip)] = hostname
            _trim(_device_names)
    except Exception:
        pass   # malformed DHCP must never break capture


def _cache_mdns(pkt):
    """Map IP → device name from mDNS .local A/AAAA answers."""
    try:
        dns = pkt[DNS]
        if not dns.ancount:
            return
        an = dns.an
        answers = an if isinstance(an, list) else _dns_chain(an)
        with _device_lock:
            for rr in answers:
                if getattr(rr, "type", None) not in (1, 28):
                    continue
                name = rr.rrname
                if isinstance(name, bytes):
                    name = name.decode("ascii", "ignore")
                name = name.rstrip(".").lower()
                ip = rr.rdata
                if isinstance(ip, bytes):
                    ip = ip.decode("ascii", "ignore")
                if ip and name.endswith(".local"):
                    _device_names[str(ip)] = name
            _trim(_device_names)
    except Exception:
        pass


def _dns_chain(rr):
    out = []
    while isinstance(rr, DNSRR):
        out.append(rr)
        rr = rr.payload
    return out


def device_hostname(ip: str = None, mac: str = None):
    """Device hostname seen via DHCP/mDNS, by MAC (preferred) or IP; else None."""
    with _device_lock:
        if mac:
            h = _device_names.get(_norm_mac(mac))
            if h:
                return h
        if ip:
            return _device_names.get(ip)
    return None


# ── Service-name extraction (SNI / HTTP Host) ──────────────────────────────────
# Names the destination service ("drive.google.com") instead of a raw IP.
# ~95% of traffic is TLS, but the ClientHello's Server Name Indication is sent
# in cleartext before encryption starts — no decryption involved.

def extract_sni(payload: bytes):
    """Server Name Indication from a TLS ClientHello, or None."""
    try:
        # TLS record type 0x16 (handshake) + handshake type 0x01 (ClientHello)
        if len(payload) < 44 or payload[0] != 0x16 or payload[5] != 0x01:
            return None
        pos = 43                                   # record(5)+hs hdr(4)+ver(2)+random(32)
        pos += 1 + payload[pos]                    # session id
        pos += 2 + int.from_bytes(payload[pos:pos + 2], "big")   # cipher suites
        pos += 1 + payload[pos]                    # compression methods
        ext_end = pos + 2 + int.from_bytes(payload[pos:pos + 2], "big")
        pos += 2
        while pos + 4 <= min(ext_end, len(payload)):
            ext_type = int.from_bytes(payload[pos:pos + 2], "big")
            ext_len  = int.from_bytes(payload[pos + 2:pos + 4], "big")
            pos += 4
            if ext_type == 0:                      # server_name extension
                name_len = int.from_bytes(payload[pos + 3:pos + 5], "big")
                name = payload[pos + 5:pos + 5 + name_len]
                return name.decode("ascii", "ignore") or None
            pos += ext_len
    except (IndexError, ValueError):
        pass
    return None


_HTTP_METHODS = (b"GET ", b"POST ", b"HEAD ", b"PUT ", b"DELETE ", b"OPTIONS ", b"PATCH ")


def extract_http_host(payload: bytes):
    """Host header from a plaintext HTTP request, or None."""
    if not payload.startswith(_HTTP_METHODS):
        return None
    head = payload[:2048]
    i = head.find(b"\r\nHost:")
    if i < 0:
        return None
    j = head.find(b"\r\n", i + 7)
    host = head[i + 7 : j if j > 0 else len(head)].strip()
    return host.decode("ascii", "ignore") or None


# ── Flow record ────────────────────────────────────────────────────────────────

class FlowRecord:
    """Tracks per-flow statistics matching CICIDS2017 feature columns."""

    __slots__ = (
        "src_ip", "dst_ip", "src_port", "dst_port", "protocol", "src_mac",
        "start_time", "last_time",
        "fwd_lengths", "bwd_lengths", "all_lengths", "all_timestamps",
        "fin", "syn", "rst", "psh", "ack",
        "init_win_fwd", "init_win_bwd", "_win_fwd_set", "_win_bwd_set",
        "sni", "_sni_tries",
    )

    def __init__(self, src_ip, dst_ip, src_port, dst_port, protocol, ts, src_mac=""):
        self.src_ip   = src_ip
        self.dst_ip   = dst_ip
        self.src_port = src_port
        self.dst_port = dst_port
        self.protocol = protocol
        self.src_mac  = src_mac

        self.start_time     = ts
        self.last_time      = ts
        self.all_timestamps = [ts]

        self.fwd_lengths = []
        self.bwd_lengths = []
        self.all_lengths = []

        self.fin = self.syn = self.rst = self.psh = self.ack = 0
        self.init_win_fwd = self.init_win_bwd = 0
        self._win_fwd_set = self._win_bwd_set = False
        self.sni        = None
        self._sni_tries = 0

    def try_hostname(self, payload: bytes):
        """Best-effort service-name extraction; handshakes arrive early, so
        only the first few payload-bearing packets are worth parsing."""
        if self.sni or self._sni_tries >= 10 or not payload:
            return
        self._sni_tries += 1
        self.sni = extract_sni(payload) or extract_http_host(payload)

    def add_packet(self, pkt_src_ip, length, ts, tcp_flags=0, window=0):
        is_fwd = (pkt_src_ip == self.src_ip)
        self.last_time = ts
        self.all_timestamps.append(ts)
        self.all_lengths.append(length)

        if is_fwd:
            self.fwd_lengths.append(length)
            if not self._win_fwd_set and window:
                self.init_win_fwd  = window
                self._win_fwd_set  = True
        else:
            self.bwd_lengths.append(length)
            if not self._win_bwd_set and window:
                self.init_win_bwd  = window
                self._win_bwd_set  = True

        self.fin += bool(tcp_flags & 0x01)
        self.syn += bool(tcp_flags & 0x02)
        self.rst += bool(tcp_flags & 0x04)
        self.psh += bool(tcp_flags & 0x08)
        self.ack += bool(tcp_flags & 0x10)

    def to_feature_dict(self) -> dict:
        dur_us   = max(1.0, (self.last_time - self.start_time) * 1_000_000)
        dur_s    = dur_us / 1_000_000

        n_fwd    = len(self.fwd_lengths) or 1
        n_bwd    = len(self.bwd_lengths) or 1
        n_all    = len(self.all_lengths)  or 1

        fwd_b    = sum(self.fwd_lengths)
        bwd_b    = sum(self.bwd_lengths)
        total_b  = fwd_b + bwd_b
        total_p  = len(self.fwd_lengths) + len(self.bwd_lengths)

        iats = []
        ts_s = sorted(self.all_timestamps)
        for i in range(1, len(ts_s)):
            iats.append((ts_s[i] - ts_s[i - 1]) * 1_000_000)  # µs
        iat_mean = float(np.mean(iats)) if iats else 0.0

        all_arr  = np.array(self.all_lengths, dtype=float) if self.all_lengths else np.array([0.0])

        return {
            # ── CICIDS features ────────────────────────────────────────────
            "Flow Duration":                  dur_us,
            "Total Fwd Packets":              len(self.fwd_lengths),
            "Total Backward Packets":         len(self.bwd_lengths),
            "Total Length of Fwd Packets":    fwd_b,
            "Total Length of Bwd Packets":    bwd_b,
            "Flow Bytes/s":                   total_b / dur_s,
            "Flow Packets/s":                 total_p / dur_s,
            "Fwd Packet Length Mean":         float(np.mean(self.fwd_lengths)) if self.fwd_lengths else 0.0,
            "Bwd Packet Length Mean":         float(np.mean(self.bwd_lengths)) if self.bwd_lengths else 0.0,
            "Flow IAT Mean":                  iat_mean,
            "Packet Length Mean":             float(all_arr.mean()),
            "Packet Length Std":              float(all_arr.std()),
            "FIN Flag Count":                 self.fin,
            "SYN Flag Count":                 self.syn,
            "RST Flag Count":                 self.rst,
            "PSH Flag Count":                 self.psh,
            "ACK Flag Count":                 self.ack,
            "Average Packet Size":            float(all_arr.mean()),
            "Init_Win_bytes_forward":         self.init_win_fwd,
            "Init_Win_bytes_backward":        self.init_win_bwd,
            # ── Display fields (not used by model) ─────────────────────────
            "Source IP":                      self.src_ip,
            "Destination IP":                 self.dst_ip,
            "Protocol":                       self.protocol,
            "src_mac":                        self.src_mac or "Live",
            "device_type":                    "unknown",
            # SNI parsed from the handshake wins; otherwise fall back to the
            # name this destination IP was resolved from (passive DNS) — and
            # check both endpoints, since the flow's "destination" is just
            # whichever side did not send the first packet we saw.
            "sni":                            self.sni
                                              or dns_hostname(self.dst_ip)
                                              or dns_hostname(self.src_ip),
            # Source-device hostname (DHCP/mDNS) — detect() combines it with the
            # MAC-OUI vendor to identify the device.
            "device_hostname":                device_hostname(ip=self.src_ip, mac=self.src_mac)
                                              or device_hostname(ip=self.dst_ip),
        }


# ── Collector ──────────────────────────────────────────────────────────────────

class NetworkCollector:
    """
    Singleton live-capture engine.

    Lifecycle:
      collector.start(iface)  → starts sniff thread + flush thread
      collector.stop()        → signals both threads to exit
      collector.pop_detections() → returns and clears pending anomalies
    """

    def __init__(self, flow_timeout: int = 15, flush_interval: int = 5,
                 promisc: bool = True):
        self.flow_timeout   = flow_timeout
        self.flush_interval = flush_interval
        # Promiscuous mode: accept frames not addressed to this host's MAC.
        # This only yields OTHER devices' traffic where the wire actually
        # delivers it — a hub, a switch SPAN/mirror port, or Wi-Fi monitor
        # mode. On an ordinary switched LAN the switch still forwards only
        # this host's unicast, so promisc changes nothing there (use the
        # active service scan below to enumerate other devices instead).
        self.promisc        = promisc

        self._flows:   dict  = {}
        self._lock           = threading.Lock()
        self._running        = False
        self._sniff_thread   = None
        self._flush_thread   = None

        self.packets_seen    = 0
        self.flows_analysed  = 0
        self.started_at      = None
        self._detections     = []
        self._errors         = []

    # ── Internal helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _flow_key(src_ip, dst_ip, src_port, dst_port, proto):
        """Canonical bidirectional key so A→B and B→A share the same record."""
        if (src_ip, src_port) <= (dst_ip, dst_port):
            return (src_ip, dst_ip, src_port, dst_port, proto)
        return (dst_ip, src_ip, dst_port, src_port, proto)

    def _process_packet(self, pkt):
        if not self._running:
            return
        if not pkt.haslayer(IP):
            return

        self.packets_seen += 1

        # Passive DNS: cache answer-IP → name from responses we sniff, so
        # later flows to that IP can be named even without a parseable SNI.
        # mDNS (UDP 5353) names the DEVICE (.local) rather than a destination.
        if pkt.haslayer(DNS):
            if pkt.haslayer(UDP) and (pkt[UDP].sport == 5353 or pkt[UDP].dport == 5353):
                _cache_mdns(pkt)
            else:
                _cache_dns_response(pkt[DNS])
        # DHCP option-12 carries the client's own hostname.
        if pkt.haslayer(DHCP):
            _cache_dhcp(pkt)

        ip      = pkt[IP]
        src_ip  = ip.src
        dst_ip  = ip.dst
        proto   = ip.proto
        src_port = dst_port = flags = window = 0
        src_mac = ""

        if pkt.haslayer(Ether):
            src_mac = pkt[Ether].src

        payload = b""
        if pkt.haslayer(TCP):
            t        = pkt[TCP]
            src_port = t.sport
            dst_port = t.dport
            flags    = int(t.flags)
            window   = t.window
            payload  = bytes(t.payload)
        elif pkt.haslayer(UDP):
            u        = pkt[UDP]
            src_port = u.sport
            dst_port = u.dport

        length = len(pkt)
        ts     = time.time()
        key    = self._flow_key(src_ip, dst_ip, src_port, dst_port, proto)

        with self._lock:
            if key not in self._flows:
                self._flows[key] = FlowRecord(
                    src_ip, dst_ip, src_port, dst_port, proto, ts, src_mac
                )
            flow = self._flows[key]
            flow.add_packet(src_ip, length, ts, flags, window)
            if payload:
                flow.try_hostname(payload)

    def _flush_loop(self):
        from ml.model import detect

        while self._running:
            time.sleep(self.flush_interval)
            now      = time.time()
            to_flush = []

            with self._lock:
                expired = [k for k, f in self._flows.items()
                           if (now - f.last_time) >= self.flow_timeout]
                for k in expired:
                    to_flush.append(self._flows.pop(k))

            if not to_flush:
                continue

            records = [f.to_feature_dict() for f in to_flush]
            self.flows_analysed += len(records)

            try:
                results, _ = detect(records)
                if results:
                    with self._lock:
                        self._detections.extend(results)
            except Exception as exc:
                self._errors.append(str(exc))
                print(f"[collector] detect() error: {exc}")

    def _sniff_loop(self, iface):
        try:
            sniff(
                iface=iface,
                prn=self._process_packet,
                store=False,
                promisc=self.promisc,
                stop_filter=lambda _: not self._running,
            )
        except Exception as exc:
            self._errors.append(str(exc))
            self._running = False
            print(f"[collector] sniff error: {exc}")

    # ── Public API ─────────────────────────────────────────────────────────────

    def start(self, iface: str = None):
        if self._running:
            return False, "Already running"
        if not SCAPY_AVAILABLE:
            return False, "Scapy is not installed. Run: pip install scapy"

        self._running       = True
        self.started_at     = time.time()
        self.packets_seen   = 0
        self.flows_analysed = 0
        self._detections    = []
        self._errors        = []
        self._flows         = {}

        self._flush_thread = threading.Thread(target=self._flush_loop, daemon=True)
        self._flush_thread.start()

        self._sniff_thread = threading.Thread(
            target=self._sniff_loop, args=(iface,), daemon=True
        )
        self._sniff_thread.start()

        return True, "Started"

    def stop(self):
        self._running = False

    def status(self) -> dict:
        uptime = round(time.time() - self.started_at, 1) if self.started_at and self._running else 0
        return {
            "running":          self._running,
            "packets_seen":     self.packets_seen,
            "flows_analysed":   self.flows_analysed,
            "active_flows":     len(self._flows),
            "detections_found": len(self._detections),
            "uptime_s":         uptime,
            "errors":           self._errors[-5:],
        }

    def flush_all(self):
        """Force-analyse every active flow immediately, ignoring the idle timeout."""
        from ml.model import detect
        with self._lock:
            to_flush = list(self._flows.values())
            self._flows = {}

        if not to_flush:
            return 0

        records = [f.to_feature_dict() for f in to_flush]
        self.flows_analysed += len(records)
        try:
            results, _ = detect(records)
            if results:
                with self._lock:
                    self._detections.extend(results)
        except Exception as exc:
            self._errors.append(str(exc))
        return len(records)

    def pop_detections(self) -> list:
        with self._lock:
            d = list(self._detections)
            self._detections = []
            return d


# ── Active service discovery (ARP sweep + TCP service scan) ────────────────────
# Passive capture only ever sees THIS host's traffic on a switched LAN. To learn
# what OTHER devices exist and what services they run, we probe them actively:
#   1. ARP sweep the local /24  → live devices ({ip, mac})
#   2. TCP-connect a small curated set of service ports on each  → open services
#
# This SENDS packets to every device on the subnet. It is legitimate for a
# network you own or are authorised to assess (the Shadow IT use case), but on a
# shared/institutional network it can breach acceptable-use policy. So it is
# gated behind an explicit `authorized=True` and scoped to the local subnet.

# Common service ports → label. Deliberately small (fast, gentle); extend as
# needed. These are the services a Shadow IT audit most cares about on an endpoint.
SERVICE_PORTS = {
    21: "FTP", 22: "SSH", 23: "Telnet", 25: "SMTP", 53: "DNS",
    80: "HTTP", 110: "POP3", 139: "NetBIOS", 143: "IMAP", 443: "HTTPS",
    445: "SMB", 587: "SMTP", 993: "IMAPS", 1433: "MSSQL", 1883: "MQTT",
    3306: "MySQL", 3389: "RDP", 5000: "HTTP/UPnP", 5432: "PostgreSQL",
    5900: "VNC", 6379: "Redis", 8000: "HTTP-alt", 8080: "HTTP-proxy",
    8443: "HTTPS-alt", 9200: "Elasticsearch", 27017: "MongoDB",
}

# Ports that, exposed on a random endpoint, are the most likely Shadow IT /
# risk signal (remote access, unauthenticated data stores). Drives risk_level
# when scan results are turned into detection records.
_RISKY_PORTS = {
    23: "high", 3389: "high", 5900: "high", 445: "high", 6379: "high",
    9200: "high", 27017: "high", 1433: "high", 3306: "medium",
    5432: "medium", 21: "medium", 1883: "medium",
}


def discover_devices(subnet: str, timeout: int = 2) -> list[dict]:
    """ARP-sweep a subnet (e.g. '192.168.16.0/24'); return live [{ip, mac}].
    Layer-2 only — cannot cross a router, which is exactly the local segment
    a Shadow IT audit is scoped to."""
    if not SCAPY_AVAILABLE:
        raise RuntimeError("Scapy not available — cannot ARP sweep")
    from scapy.layers.l2 import ARP
    from scapy.sendrecv import srp

    pkt = Ether(dst="ff:ff:ff:ff:ff:ff") / ARP(pdst=str(subnet))
    answered, _ = srp(pkt, timeout=timeout, verbose=False)
    seen: dict[str, str] = {}
    for _, reply in answered:
        seen[reply.psrc] = reply.hwsrc          # de-dupe by IP
    return [{"ip": ip, "mac": mac} for ip, mac in seen.items()]


def scan_ports(ip: str, ports: dict = None, connect_timeout: float = 0.5,
               max_workers: int = 32) -> list[dict]:
    """TCP-connect scan of one host over a curated port set. Returns the open
    ones as [{port, service}]. Connect scan only (no raw SYN) — no special
    privileges, and it completes the handshake so it is not stealthy by design."""
    ports = ports or SERVICE_PORTS

    def probe(item):
        port, name = item
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(connect_timeout)
                if s.connect_ex((ip, port)) == 0:
                    return {"port": port, "service": name}
        except OSError:
            pass
        return None

    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        found = [r for r in ex.map(probe, ports.items()) if r]
    return sorted(found, key=lambda r: r["port"])


def active_scan(iface_ip: str, prefix: int = 24, ports: dict = None, *,
                authorized: bool = False, arp_timeout: int = 2,
                connect_timeout: float = 0.5, max_workers: int = 64) -> list[dict]:
    """Full sweep of the local subnet: discover devices, then enumerate the
    services each runs. Returns [{ip, mac, services:[{port, service}]}].

    `iface_ip` is any IPv4 on the target segment (e.g. this host's Wi-Fi IP —
    see list_interfaces()); the /prefix subnet is derived from it.

    Requires `authorized=True`: this sends ARP + TCP probes to every device on
    the subnet. Only run it on a network you own or are permitted to assess.
    """
    if not authorized:
        raise PermissionError(
            "active_scan performs an ACTIVE ARP sweep + TCP port scan of the "
            "whole subnet. Pass authorized=True only for a network you own or "
            "are permitted to scan — probing a shared/institutional network "
            "without consent may violate acceptable-use policy or law."
        )
    if not SCAPY_AVAILABLE:
        raise RuntimeError("Scapy not available — cannot run active scan")

    subnet  = ipaddress.ip_network(f"{iface_ip}/{prefix}", strict=False)
    devices = discover_devices(str(subnet), timeout=arp_timeout)
    by_ip   = {d["ip"]: {"ip": d["ip"], "mac": d["mac"], "services": []}
               for d in devices}
    ports   = ports or SERVICE_PORTS

    # Fan out over (host, port) pairs so a slow host can't stall the sweep.
    tasks = [(ip, port, name) for ip in by_ip for port, name in ports.items()]

    def probe(task):
        ip, port, name = task
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(connect_timeout)
                if s.connect_ex((ip, port)) == 0:
                    return ip, {"port": port, "service": name}
        except OSError:
            pass
        return ip, None

    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        for ip, svc in ex.map(probe, tasks):
            if svc:
                by_ip[ip]["services"].append(svc)

    for dev in by_ip.values():
        dev["services"].sort(key=lambda r: r["port"])
    return list(by_ip.values())


def scan_to_detections(scan_results: list[dict]) -> list[dict]:
    """Map active-scan results into the detection-record shape the DB and
    dashboard already use (see backend/routes/scan.py). One record per open
    service; risk_level comes from _RISKY_PORTS. anomaly_score is 0.0 — these
    are actively-observed services, not IsolationForest anomalies."""
    records = []
    for dev in scan_results:
        for svc in dev["services"]:
            records.append({
                "src_ip":           dev["ip"],
                "src_mac":          dev.get("mac", "Unknown"),
                "dst_domain":       f'{svc["service"]}:{svc["port"]}',
                "protocol":         "TCP",
                "bytes_sent":       0,
                "bytes_received":   0,
                "duration":         0,
                # Identify the device vendor from its MAC (OUI) where possible.
                "device_type":      vendor_from_mac(dev.get("mac")) or "network-host",
                "shadow_it_type":   "software",
                "risk_level":       _RISKY_PORTS.get(svc["port"], "low"),
                "anomaly_score":    0.0,
                "app_category":     "exposed-service",
                "detection_source": "active-scan",
            })
    return records


# ── Helpers ────────────────────────────────────────────────────────────────────

def _routing_ip():
    """Local IP of the adapter that actually routes internet traffic.
    'Connecting' a UDP socket picks the outbound interface without sending
    a single packet. None if offline."""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return None


def list_interfaces() -> list[dict]:
    """
    Returns interfaces with human-readable descriptions instead of raw
    `\\Device\\NPF_{GUID}` paths, sorted so the adapter that routes internet
    traffic comes first (virtual adapters like Hyper-V switches also carry an
    IP, so "has an IP" alone is not enough — an alphabetical sort put a
    Hyper-V adapter above the real Wi-Fi one). Adapters with any routable
    IPv4 come next; pseudo/TAP adapters without one go last.
    `device` is the raw path Scapy's sniff(iface=...) needs.
    """
    if not SCAPY_AVAILABLE:
        return []
    try:
        routing_ip = _routing_ip()
        result = []
        for device, iface in conf.ifaces.items():
            description = getattr(iface, "description", "") or device
            ips4 = list(getattr(iface, "ips", {}).get(4, []))
            ip = next((a for a in ips4 if a and not a.startswith("169.254.")), None)
            result.append({"device": device, "description": description, "ip": ip})
        result.sort(key=lambda r: (r["ip"] != routing_ip or routing_ip is None,
                                   r["ip"] is None, r["description"]))
        return result
    except Exception:
        return get_if_list()


# ── Module-level singleton ─────────────────────────────────────────────────────
_instance: NetworkCollector | None = None


def get_collector() -> NetworkCollector:
    global _instance
    if _instance is None:
        _instance = NetworkCollector()
    return _instance
