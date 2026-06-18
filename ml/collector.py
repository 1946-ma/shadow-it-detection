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
import threading
import numpy as np

try:
    from scapy.all import sniff, get_if_list, conf
    from scapy.layers.inet import IP, TCP, UDP, ICMP
    from scapy.layers.l2 import Ether
    SCAPY_AVAILABLE = True
except Exception:
    SCAPY_AVAILABLE = False


# ── Flow record ────────────────────────────────────────────────────────────────

class FlowRecord:
    """Tracks per-flow statistics matching CICIDS2017 feature columns."""

    __slots__ = (
        "src_ip", "dst_ip", "src_port", "dst_port", "protocol", "src_mac",
        "start_time", "last_time",
        "fwd_lengths", "bwd_lengths", "all_lengths", "all_timestamps",
        "fin", "syn", "rst", "psh", "ack",
        "init_win_fwd", "init_win_bwd", "_win_fwd_set", "_win_bwd_set",
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

    def __init__(self, flow_timeout: int = 15, flush_interval: int = 5):
        self.flow_timeout   = flow_timeout
        self.flush_interval = flush_interval

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
        ip      = pkt[IP]
        src_ip  = ip.src
        dst_ip  = ip.dst
        proto   = ip.proto
        src_port = dst_port = flags = window = 0
        src_mac = ""

        if pkt.haslayer(Ether):
            src_mac = pkt[Ether].src

        if pkt.haslayer(TCP):
            t        = pkt[TCP]
            src_port = t.sport
            dst_port = t.dport
            flags    = int(t.flags)
            window   = t.window
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
            self._flows[key].add_packet(src_ip, length, ts, flags, window)

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


# ── Helpers ────────────────────────────────────────────────────────────────────

def list_interfaces() -> list[str]:
    if not SCAPY_AVAILABLE:
        return []
    try:
        return get_if_list()
    except Exception:
        return []


# ── Module-level singleton ─────────────────────────────────────────────────────
_instance: NetworkCollector | None = None


def get_collector() -> NetworkCollector:
    global _instance
    if _instance is None:
        _instance = NetworkCollector()
    return _instance
