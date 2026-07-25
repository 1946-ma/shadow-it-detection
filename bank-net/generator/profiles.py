"""
Traffic profiles for the virtual bank network.

One entry per container ROLE. Each profile is a list of "behaviours" the
generator loops over. A behaviour is a dict:

    {"action": "browse",  "targets": [<hostnames>], "weight": <int>}
    {"action": "bulk_upload", "sink": "<url>", "weight": <int>}
    {"action": "beacon",  "host": "<hostname>", "port": <int>, "interval": <s>, "weight": <int>}
    {"action": "dashboard_login", "url": "<api-base>", "username": "..", "password": ".."}

`weight` biases how often the generator picks that behaviour on each tick
(higher = more frequent). Hostnames are REAL services so the outbound TLS
ClientHello carries a genuine SNI the collector extracts — that is what makes a
flow name a service (e.g. `dropbox.com`) instead of a bare IP.

This module is the single source of truth for what each role does, so
EXPECTED.md can be checked against it. Nothing here is secret; everything is
overridable via environment variables read in traffic_gen.py.

Detection mapping (see ../EXPECTED.md):
  - SANCTIONED hosts (bank's own apps, M365, official mail) -> suppressed by the
    demo allowlist (bank-net/config/sanctioned_services.demo.txt).
  - CATALOG hosts (Dropbox, ChatGPT, TeamViewer, ngrok, the crypto beacon, ...)
    -> detection_source="catalog", risk from ml/saas_catalog.csv.
  - Everything else that the hybrid model finds unusual -> detection_source="anomaly".
"""

# ── Sanctioned baseline: the bank's authorised apps (should be SUPPRESSED) ──────
# These MUST also appear in config/sanctioned_services.demo.txt so detect()
# suppresses them. Kept here so tellers generate a realistic "authorised" floor
# of traffic that the dashboard shows being correctly ignored.
SANCTIONED = [
    "onlinebanking.demo-bank.test",   # the bank's core online-banking portal
    "portal.demo-bank.test",          # staff portal
    "login.microsoftonline.com",      # Microsoft 365 (sanctioned productivity)
    "outlook.office365.com",          # official corporate mail
    "sharepoint.com",                 # sanctioned document store
]

# ── Unsanctioned SaaS already in ml/saas_catalog.csv (CATALOG detections) ──────
CLOUD_STORAGE = ["dropbox.com", "wetransfer.com", "mega.nz"]
GEN_AI        = ["chatgpt.com", "claude.ai", "gemini.google.com"]
REMOTE_ACCESS = ["teamviewer.com", "anydesk.com", "ngrok.com"]
PERSONAL_MAIL = ["mail.google.com", "proton.me"]
MESSAGING     = ["telegram.org", "discord.com"]

# Crypto beacon destination — added to the catalog via
# config/saas_catalog.additions.csv (category crypto-mining, risk high) so it is
# a DETERMINISTIC catalog hit rather than relying on the anomaly model.
CRYPTO_BEACON_HOST = "pool.example-mine.test"
CRYPTO_BEACON_PORT = 3333

# Bulk-upload sink for the exfil role (ANOMALY path). Overridable via env
# EXFIL_SINK; defaults to a real transfer service so the flow actually leaves the
# host. The large forward byte volume is what the hybrid model should flag.
DEFAULT_EXFIL_SINK = "https://transfer.sh"


PROFILES = {
    # Workstation: mostly sanctioned, with the occasional unsanctioned slip.
    "teller": [
        {"action": "browse", "targets": SANCTIONED,       "weight": 8},
        {"action": "browse", "targets": PERSONAL_MAIL,    "weight": 1},
        {"action": "browse", "targets": CLOUD_STORAGE,    "weight": 1},
    ],
    # Heavy unsanctioned SaaS user.
    "employee": [
        {"action": "browse", "targets": CLOUD_STORAGE,    "weight": 4},
        {"action": "browse", "targets": GEN_AI,           "weight": 4},
        {"action": "browse", "targets": PERSONAL_MAIL,    "weight": 2},
        {"action": "browse", "targets": SANCTIONED,       "weight": 2},
    ],
    # IT support running unmanaged remote-access tools.
    "support": [
        {"action": "browse", "targets": REMOTE_ACCESS,    "weight": 6},
        {"action": "browse", "targets": SANCTIONED,       "weight": 2},
        {"action": "browse", "targets": MESSAGING,        "weight": 1},
    ],
    # Rogue Raspberry Pi: low-rate beacon + a little unsanctioned traffic. Its
    # Raspberry-Pi OUI MAC (set in docker-compose.yml) makes it show as an
    # unauthorised device in Devices / Network Discovery.
    "rogue": [
        {"action": "browse", "targets": MESSAGING,        "weight": 2},
        {"action": "browse", "targets": CLOUD_STORAGE,    "weight": 1},
        {"action": "beacon", "host": CRYPTO_BEACON_HOST,
         "port": CRYPTO_BEACON_PORT, "interval": 30,      "weight": 3},
    ],
    # Data exfiltration: bulk upload (anomaly) + crypto beacon (catalog).
    "exfil": [
        {"action": "bulk_upload", "sink": DEFAULT_EXFIL_SINK, "weight": 5},
        {"action": "beacon", "host": CRYPTO_BEACON_HOST,
         "port": CRYPTO_BEACON_PORT, "interval": 20,          "weight": 5},
    ],
}


def profile_for(role: str) -> list:
    """Behaviour list for a ROLE, or the teller baseline if unknown."""
    return PROFILES.get(role, PROFILES["teller"])
