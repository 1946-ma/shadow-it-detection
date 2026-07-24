"""
Destination-IP enrichment for the detector (added 2026-07-24).

When the collector can't extract a hostname (TLS SNI / HTTP Host / passive DNS)
a flow's destination is a bare IP. Most of those bare IPs are network chatter
(multicast, broadcast, link-local, the LAN gateway) rather than Shadow IT.
This module turns raw IPs into something legible and lets `detect()` drop pure
infrastructure noise:

  - classify_ip()          — label / suppress special-purpose ranges
  - reverse_dns()          — cached, timeout-bounded PTR lookup for public IPs
  - describe_destination()  — the combined entry point used by ml/model.py

Zero external dependencies — stdlib `ipaddress`, `socket`, `concurrent.futures`.
"""
from __future__ import annotations

import ipaddress
import socket
from concurrent.futures import ThreadPoolExecutor, TimeoutError as _FutureTimeout

# Well-known IPv4 multicast groups → human-readable service name.
_MCAST_SERVICES = {
    "224.0.0.1":       "all-hosts",
    "224.0.0.22":      "IGMP",
    "224.0.0.251":     "mDNS",
    "224.0.0.252":     "LLMNR",
    "239.255.255.250": "SSDP",
}

_CGNAT_NET = ipaddress.ip_network("100.64.0.0/10")


def classify_ip(ip: str) -> tuple[str, str] | None:
    """Classify a destination IP.

    Returns
    -------
    ("suppress", label) — pure network infrastructure (multicast / broadcast /
                          link-local). The caller should DROP the detection.
    ("label", text)     — a nameable special range (gateway, LAN device,
                          localhost, CGNAT). The caller uses `text` as dst.
    None                — an ordinary public IP; caller falls through to
                          reverse-DNS, then the raw string.
    """
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return None

    if addr.version == 6:
        # Basic IPv6 handling via address properties.
        if addr.is_multicast:
            return ("suppress", f"multicast ({ip})")
        if addr.is_link_local:
            return ("suppress", f"link-local ({ip})")
        if addr.is_loopback:
            return ("label", "localhost")
        if addr.is_private:
            return ("label", f"LAN device ({ip})")
        return None

    # ── IPv4 ──────────────────────────────────────────────────────────────────
    if addr.is_multicast:                     # 224.0.0.0/4
        svc = _MCAST_SERVICES.get(ip)
        return ("suppress", f"{svc} ({ip})" if svc else f"multicast ({ip})")

    if ip == "255.255.255.255" or ip.endswith(".255"):   # global / subnet broadcast
        return ("suppress", "broadcast")

    if addr.is_link_local:                    # 169.254.0.0/16
        return ("suppress", f"link-local ({ip})")

    if addr.is_loopback:                      # 127.0.0.0/8
        return ("label", "localhost")

    if addr.is_private:                       # 10/8, 172.16/12, 192.168/16
        # A trailing .1 is almost always the default gateway.
        if ip.rsplit(".", 1)[-1] == "1":
            return ("label", f"gateway ({ip})")
        return ("label", f"LAN device ({ip})")

    if addr in _CGNAT_NET:                     # 100.64.0.0/10 (carrier-grade NAT)
        return ("label", f"CGNAT ({ip})")

    return None                                # ordinary public IP


# ── Reverse DNS (PTR) — cached + timeout-bounded ────────────────────────────────
_ptr_cache: dict[str, str | None] = {}
_ptr_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="ptr")
_PTR_CACHE_MAX = 4096


def reverse_dns(ip: str, timeout: float = 1.5) -> str | None:
    """Best-effort PTR lookup for a public IP. Cached (hits AND misses).

    The blocking `gethostbyaddr` runs in a worker thread with a hard timeout so a
    slow or hanging resolver can never stall the live-capture flush loop. We do
    NOT touch socket.setdefaulttimeout — that is global and would interfere with
    psycopg / the Anthropic SDK.
    """
    if ip in _ptr_cache:
        return _ptr_cache[ip]

    name: str | None
    try:
        future = _ptr_pool.submit(lambda: socket.gethostbyaddr(ip)[0])
        name = future.result(timeout=timeout)
    except (_FutureTimeout, socket.herror, socket.gaierror, OSError):
        name = None
    except Exception:
        name = None

    if len(_ptr_cache) < _PTR_CACHE_MAX:
        _ptr_cache[ip] = name
    return name


def describe_destination(ip: str) -> str | None:
    """Human-readable label for a raw destination IP.

    Returns None when the destination is pure infrastructure noise (multicast /
    broadcast / link-local) — the caller drops the detection. Otherwise returns
    a label: a well-known range name, a reverse-DNS hostname, or the raw IP.
    """
    cls = classify_ip(ip)
    if cls is not None:
        kind, text = cls
        return None if kind == "suppress" else text

    # Ordinary public IP → try to name it, else keep the raw IP string.
    return reverse_dns(ip) or ip
