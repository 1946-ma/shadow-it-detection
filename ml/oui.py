"""
MAC OUI → hardware-vendor lookup (device identification for Shadow IT).

The first 24 bits (3 octets) of a MAC address are the IEEE-assigned
Organizationally Unique Identifier. Mapping it to a vendor turns an
"unknown device" into e.g. "Raspberry Pi Foundation" or "Espressif" — an
unmanaged Pi / ESP32 IoT board on the LAN is exactly Shadow IT hardware.

Two sources, merged (external wins):
  1. A small CURATED table of common / high-signal vendors (below) so the
     feature works out of the box with no download.
  2. The authoritative IEEE registry: drop the official CSV at ml/oui.csv
     (https://standards-oui.ieee.org/oui/oui.csv) for full coverage. Its
     `Assignment` column is a 6-hex prefix like "0050C2"; we parse that.
"""
import os

_OUI_CSV = os.path.join(os.path.dirname(__file__), "oui.csv")

# 6-hex-digit prefix (upper, no separators) → vendor. High-confidence, high
# signal entries — virtualization, single-board computers, IoT silicon, and
# common consumer brands. Extend via ml/oui.csv for the full IEEE registry.
_CURATED = {
    # Virtualization (rogue VMs / sandboxes)
    "005056": "VMware", "000C29": "VMware", "000569": "VMware",
    "080027": "VirtualBox", "525400": "QEMU/KVM", "00155D": "Microsoft (Hyper-V)",
    # Single-board computers / IoT silicon (classic Shadow IT hardware)
    "B827EB": "Raspberry Pi Foundation", "DCA632": "Raspberry Pi Trading",
    "E45F01": "Raspberry Pi Trading", "28CDC1": "Raspberry Pi Trading",
    "240AC4": "Espressif (ESP32)", "30AEA4": "Espressif (ESP32)",
    "3C71BF": "Espressif (ESP32)", "84CCA8": "Espressif (ESP32)",
    "7C9EBD": "Espressif (ESP32)",
    # Apple
    "3C0754": "Apple", "A45E60": "Apple", "F01898": "Apple", "DCA904": "Apple",
    "001B63": "Apple", "002500": "Apple", "001EC2": "Apple", "000393": "Apple",
    # Intel
    "001B21": "Intel", "A4C494": "Intel",
    # Samsung
    "3423BA": "Samsung", "5C0A5B": "Samsung", "0007AB": "Samsung",
    # Amazon / Google (smart-home)
    "44650D": "Amazon", "001A11": "Google", "546009": "Google", "F4F5D8": "Google",
    # Networking / PC OEMs
    "00000C": "Cisco", "001BD4": "Cisco", "001422": "Dell", "B8CA3A": "Dell",
    "14CC20": "TP-Link", "50C7BF": "TP-Link", "001882": "Huawei", "286C07": "Xiaomi",
}

_external: dict | None = None   # lazily-loaded IEEE registry, if present


def _load_external() -> dict:
    global _external
    if _external is not None:
        return _external
    _external = {}
    if os.path.exists(_OUI_CSV):
        try:
            import csv
            with open(_OUI_CSV, encoding="utf-8", errors="ignore") as f:
                for row in csv.DictReader(f):
                    # IEEE columns: Registry, Assignment, Organization Name, ...
                    prefix = (row.get("Assignment") or "").strip().upper()
                    org    = (row.get("Organization Name") or "").strip()
                    if len(prefix) == 6 and org:
                        _external[prefix] = org
        except Exception:
            pass   # a malformed registry file must never break detection
    return _external


def _prefix(mac: str) -> str | None:
    """Normalise a MAC to its 6-hex-digit OUI prefix, or None if unusable."""
    if not mac:
        return None
    hexonly = "".join(c for c in mac if c in "0123456789abcdefABCDEF").upper()
    return hexonly[:6] if len(hexonly) >= 6 else None


def vendor_from_mac(mac: str) -> str | None:
    """Hardware vendor for a MAC address, or None. Locally-administered /
    randomised MACs (2nd-least-significant bit of the first octet set — as
    modern phones use for privacy) are reported as 'Randomised MAC'."""
    prefix = _prefix(mac)
    if not prefix:
        return None
    # Locally-administered bit → the OUI is not a real vendor assignment.
    try:
        if int(prefix[:2], 16) & 0x02:
            return "Randomised MAC"
    except ValueError:
        return None
    return _load_external().get(prefix) or _CURATED.get(prefix)
