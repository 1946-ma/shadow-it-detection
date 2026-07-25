"""
Role-driven traffic generator for the virtual bank network.

Runs inside each bank-net container. The ROLE env var selects a profile from
profiles.py; the generator loops forever, on each tick weighting-random-picks a
behaviour and performing it as a REAL outbound connection so the captured flow
carries a genuine TLS SNI / DNS name the collector can extract.

Behaviours
----------
  browse(list)            randomised-timing HTTPS GETs to real hostnames
  bulk_upload(sink)       large POST body -> a transfer sink (ANOMALY path)
  beacon(host, port)      periodic small TCP connect (crypto-pool-style)
  dashboard_login(url)    POST /api/auth/login (concurrent-session demo)

Environment (all optional)
--------------------------
  ROLE                     teller|employee|support|rogue|exfil  (default teller)
  TICK_MIN / TICK_MAX      seconds between behaviours            (default 3 / 12)
  EXFIL_SINK               override the bulk-upload URL
  EXFIL_MB                 bulk-upload body size in MB           (default 8)
  DASHBOARD_URL            if set, also run dashboard_login each cycle
  DASHBOARD_USER/PASS      credentials for dashboard_login       (default admin/admin123)
  VERIFY_TLS               "false" to skip cert verification for .test hosts
  JITTER                   startup jitter in seconds             (default 5)

Only third-party dependency: requests. Everything else is stdlib.
"""
import os
import sys
import time
import random
import socket
import logging

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import profiles  # noqa: E402  (local module, path set above)

try:
    import requests
    from requests import exceptions as rq_exc
except ImportError:                       # pragma: no cover - container has it
    requests = None
    rq_exc = None


ROLE       = os.getenv("ROLE", "teller").strip().lower()
TICK_MIN   = float(os.getenv("TICK_MIN", "3"))
TICK_MAX   = float(os.getenv("TICK_MAX", "12"))
EXFIL_MB   = float(os.getenv("EXFIL_MB", "8"))
VERIFY_TLS = os.getenv("VERIFY_TLS", "true").lower() != "false"
JITTER     = float(os.getenv("JITTER", "5"))

DASHBOARD_URL  = os.getenv("DASHBOARD_URL", "").strip()
DASHBOARD_USER = os.getenv("DASHBOARD_USER", "admin")
DASHBOARD_PASS = os.getenv("DASHBOARD_PASS", "admin123")

logging.basicConfig(
    level=logging.INFO,
    format=f"%(asctime)s [{ROLE}] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("bank-traffic")

# Quiet the noisy per-request TLS warnings when VERIFY_TLS is off for .test hosts.
if not VERIFY_TLS and requests is not None:
    try:
        requests.packages.urllib3.disable_warnings()  # type: ignore[attr-defined]
    except Exception:
        pass

_UA = "bank-net-traffic-gen/1.0"


# ── Behaviours ──────────────────────────────────────────────────────────────────
def browse(targets: list) -> None:
    """One HTTPS GET to a randomly chosen host. The value here is the TLS
    handshake (real SNI), not the response — failures/timeouts are fine."""
    host = random.choice(targets)
    url  = f"https://{host}/"
    try:
        requests.get(url, timeout=8, headers={"User-Agent": _UA}, verify=VERIFY_TLS)
        log.info("browse  -> %s", host)
    except (rq_exc.RequestException if rq_exc else Exception) as exc:
        # The SNI already went out on the wire before any error; that's what we want.
        log.info("browse  -> %s (%s)", host, type(exc).__name__)


def bulk_upload(sink: str) -> None:
    """Large POST -> transfer sink. High forward-byte volume drives the ANOMALY
    path. Size is capped and the body is throwaway random bytes."""
    size = int(max(1.0, EXFIL_MB) * 1024 * 1024)
    body = os.urandom(min(size, 32 * 1024 * 1024))   # hard cap 32 MB
    try:
        requests.post(sink, data=body, timeout=30,
                      headers={"User-Agent": _UA, "Content-Type": "application/octet-stream"},
                      verify=VERIFY_TLS)
        log.info("upload  -> %s (%d bytes)", sink, len(body))
    except (rq_exc.RequestException if rq_exc else Exception) as exc:
        log.info("upload  -> %s (%s)", sink, type(exc).__name__)


def beacon(host: str, port: int, interval: int) -> None:
    """Small periodic TCP connect (crypto-pool-style). Named host -> the
    collector's passive DNS / catalog names it; a DETERMINISTIC catalog hit
    when the host is in saas_catalog.additions.csv."""
    try:
        # A DNS lookup first so the collector's passive-DNS cache can name the IP.
        try:
            socket.getaddrinfo(host, port)
        except socket.gaierror:
            pass
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(4)
            s.connect_ex((host, port))
            try:
                s.sendall(b'{"id":1,"method":"mining.subscribe"}\n')
            except OSError:
                pass
        log.info("beacon  -> %s:%d", host, port)
    except Exception as exc:
        log.info("beacon  -> %s:%d (%s)", host, port, type(exc).__name__)
    time.sleep(max(1, int(interval)))


def dashboard_login(url: str, username: str, password: str) -> None:
    """POST /api/auth/login to the framework. Two roles doing this with the SAME
    account from two container IPs exercises concurrent-session detection (set
    CONCURRENT_SESSION_MAX_IPS=1 on the detection PC for a two-container demo)."""
    endpoint = url.rstrip("/") + "/api/auth/login"
    try:
        r = requests.post(endpoint, json={"username": username, "password": password},
                          timeout=8, headers={"User-Agent": _UA}, verify=VERIFY_TLS)
        log.info("login   -> %s (%s)", endpoint, r.status_code)
    except (rq_exc.RequestException if rq_exc else Exception) as exc:
        log.info("login   -> %s (%s)", endpoint, type(exc).__name__)


# ── Dispatch ─────────────────────────────────────────────────────────────────────
def _run_behaviour(b: dict) -> None:
    action = b.get("action")
    if action == "browse":
        browse(b["targets"])
    elif action == "bulk_upload":
        bulk_upload(os.getenv("EXFIL_SINK", b["sink"]))
    elif action == "beacon":
        beacon(b["host"], b["port"], b.get("interval", 30))
    elif action == "dashboard_login":
        dashboard_login(b["url"], b.get("username", DASHBOARD_USER),
                        b.get("password", DASHBOARD_PASS))
    else:
        log.warning("unknown action: %s", action)


def _weighted_choice(behaviours: list) -> dict:
    pool = []
    for b in behaviours:
        pool.extend([b] * max(1, int(b.get("weight", 1))))
    return random.choice(pool)


def main() -> None:
    if requests is None:
        log.error("The 'requests' package is required. pip install requests")
        sys.exit(1)

    behaviours = list(profiles.profile_for(ROLE))
    log.info("starting: %d behaviours, tick %.0f-%.0fs, verify_tls=%s",
             len(behaviours), TICK_MIN, TICK_MAX, VERIFY_TLS)

    # Stagger container starts so flows don't all land in the same instant.
    time.sleep(random.uniform(0, max(0.0, JITTER)))

    while True:
        _run_behaviour(_weighted_choice(behaviours))

        # Optional concurrent-session demo: every role can also authenticate to
        # the framework when DASHBOARD_URL is set (run it on two containers with
        # the same account to trigger the detection).
        if DASHBOARD_URL:
            dashboard_login(DASHBOARD_URL, DASHBOARD_USER, DASHBOARD_PASS)

        time.sleep(random.uniform(TICK_MIN, TICK_MAX))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log.info("stopped")
