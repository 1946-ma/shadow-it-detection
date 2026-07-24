"""
AI Assistant — a read-only LLM (Claude) over the detections database.

The admin asks natural-language questions ("which source has the most high-risk
detections?"); Claude answers by calling a small set of READ-ONLY tools that wrap
the existing SQL queries. It can never write or delete — there is no such tool —
and every question is recorded in the immutable audit log.
"""
import os
import json
import logging

from flask import Blueprint, request, jsonify, g

from backend.models.db_models import execute, detections_has_shadowit_cols, insert_detections
from backend.middleware.jwt_auth import token_required
from backend.middleware.rbac import admin_required
from backend.extensions import limiter

assistant_bp = Blueprint("assistant", __name__)
log = logging.getLogger("shadow-it")

ASSISTANT_MODEL = os.getenv("ASSISTANT_MODEL", "claude-sonnet-5")
MAX_TOOL_TURNS  = 6

# Reuse the same whitelists the detections API validates against.
_ALLOWED_RISK   = {"high", "medium", "low"}
_ALLOWED_TYPE   = {"software", "hardware", "mixed", "none", "identity"}
_ALLOWED_SOURCE = {"catalog", "anomaly", "active-scan", "concurrent-session"}

SYSTEM_PROMPT = (
    "You are a security-analyst assistant for a Shadow IT detection dashboard. "
    "Answer questions about the organisation's detections using ONLY the provided "
    "tools — never invent numbers, IPs, or services. Be concise and cite specific "
    "figures from the tool results.\n\n"
    "You can also MONITOR and CONTROL live network packet capture: check scan "
    "status, list capture interfaces, start or stop a live scan, and force-analyse "
    "the current flows for anomalies. Starting or stopping capture is a real action "
    "on the host, so only do it when the administrator clearly asks; then report "
    "what happened (interface, packets seen, flows analysed, new detections). If no "
    "interface is given when starting, use the default (the one that routes internet "
    "traffic — the first from list_interfaces).\n\n"
    "You cannot modify, resolve, or delete stored detection records. When asked for "
    "recommendations, suggest concrete next actions but make clear the administrator "
    "decides and must act."
)

# ── Read-only tool definitions (JSON schema) ────────────────────────────────────
TOOLS = [
    {
        "name": "get_summary",
        "description": "Overall detection counts: totals, resolved/unresolved, and "
                       "breakdowns by risk level, Shadow IT type, detection source, and "
                       "app category (e.g. cloud-storage, ai, vpn, messaging).",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "search_detections",
        "description": "List detections matching optional filters, newest first. Use "
                       "this to answer questions about specific risks, types, sources, "
                       "or source IPs.",
        "input_schema": {
            "type": "object",
            "properties": {
                "risk":     {"type": "string", "enum": sorted(_ALLOWED_RISK)},
                "type":     {"type": "string", "enum": sorted(_ALLOWED_TYPE)},
                "source":   {"type": "string", "enum": sorted(_ALLOWED_SOURCE)},
                "src_ip":   {"type": "string", "description": "Exact source IP to filter by."},
                "resolved": {"type": "boolean"},
                "limit":    {"type": "integer", "description": "Max rows (1-50)."},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "top_offenders",
        "description": "Source IPs (devices) with the most detections, with per-risk and "
                       "unresolved counts. Use for 'which DEVICE / source IP is the biggest "
                       "offender'. Note: on host-based capture the capturing host's own IP "
                       "usually dominates.",
        "input_schema": {
            "type": "object",
            "properties": {"limit": {"type": "integer", "description": "Max IPs (1-10)."}},
            "additionalProperties": False,
        },
    },
    {
        "name": "top_destinations",
        "description": "The most-contacted destinations/services (dst_domain) across "
                       "detections — i.e. WHICH APPS/SERVICES are most used. Use for "
                       "'which services/apps are most used', 'top unsanctioned SaaS', or "
                       "'what shadow IT is being used'. Optionally filter by detection "
                       "source (e.g. 'catalog' = unsanctioned known SaaS).",
        "input_schema": {
            "type": "object",
            "properties": {
                "source": {"type": "string", "enum": sorted(_ALLOWED_SOURCE)},
                "limit":  {"type": "integer", "description": "Max destinations (1-15)."},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "recent_audit",
        "description": "Recent entries from the tamper-proof audit log (logins, scans, "
                       "detections run, concurrent-session events, etc.).",
        "input_schema": {
            "type": "object",
            "properties": {"limit": {"type": "integer", "description": "Max entries (1-20)."}},
            "additionalProperties": False,
        },
    },
    # ── Live network capture: monitor + control ──────────────────────────────
    {
        "name": "list_interfaces",
        "description": "List the host's available network capture interfaces (for live "
                       "scanning). The internet-routing interface is listed first.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "get_scan_status",
        "description": "Current live-capture status: running?, packets_seen, "
                       "flows_analysed, active_flows, detections_found, uptime. Use to "
                       "MONITOR live network traffic.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "start_live_scan",
        "description": "Start live packet capture on the host (an ACTION — only when the "
                       "admin clearly asks). Optionally specify an interface device path; "
                       "otherwise the internet-routing interface is used.",
        "input_schema": {
            "type": "object",
            "properties": {"iface": {"type": "string", "description": "Interface device path (from list_interfaces). Optional."}},
            "additionalProperties": False,
        },
    },
    {
        "name": "stop_live_scan",
        "description": "Stop the running live packet capture (an ACTION — only when the admin asks).",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "analyze_now",
        "description": "Force-analyse all currently-active flows immediately and save any "
                       "anomalies as detections. Returns how many flows were analysed and "
                       "what new detections were found. Use for 'analyse the live traffic now'.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
]


def _iso(rows):
    out = []
    for r in rows:
        d = dict(r)
        for k, v in list(d.items()):
            if hasattr(v, "isoformat"):
                d[k] = v.isoformat()
        out.append(d)
    return out


# ── Tool implementations (all READ-ONLY, bounded) ───────────────────────────────
def _tool_get_summary(_inp):
    total    = execute("SELECT COUNT(*) AS c FROM detections", fetch="one")["c"]
    resolved = execute("SELECT COUNT(*) AS c FROM detections WHERE is_resolved", fetch="one")["c"]
    by_risk  = execute("SELECT risk_level, COUNT(*) AS c FROM detections GROUP BY risk_level", fetch="all") or []
    by_type  = execute("SELECT shadow_it_type, COUNT(*) AS c FROM detections GROUP BY shadow_it_type", fetch="all") or []
    result = {
        "total": int(total), "resolved": int(resolved), "unresolved": int(total) - int(resolved),
        "by_risk": {r["risk_level"]: int(r["c"]) for r in by_risk},
        "by_type": {r["shadow_it_type"]: int(r["c"]) for r in by_type},
    }
    if detections_has_shadowit_cols():
        by_src = execute("SELECT detection_source, COUNT(*) AS c FROM detections GROUP BY detection_source", fetch="all") or []
        result["by_source"] = {r["detection_source"]: int(r["c"]) for r in by_src}
        by_cat = execute(
            "SELECT app_category, COUNT(*) AS c FROM detections "
            "WHERE app_category IS NOT NULL GROUP BY app_category ORDER BY c DESC",
            fetch="all",
        ) or []
        result["by_category"] = {r["app_category"]: int(r["c"]) for r in by_cat}
    return result


def _tool_top_destinations(inp):
    conds, params = [], []
    if inp.get("source") in _ALLOWED_SOURCE and detections_has_shadowit_cols():
        conds.append("detection_source = %s"); params.append(inp["source"])
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    limit = min(15, max(1, int(inp.get("limit", 10))))
    params.append(limit)
    rows = execute(
        f"SELECT dst_domain, COUNT(*) AS total, "
        f"       SUM(CASE WHEN risk_level='high' THEN 1 ELSE 0 END) AS high_count, "
        f"       COUNT(DISTINCT src_ip) AS distinct_sources, "
        f"       MAX(detected_at) AS last_seen "
        f"FROM detections {where} "
        f"GROUP BY dst_domain ORDER BY total DESC LIMIT %s",
        params, fetch="all",
    ) or []
    for r in rows:
        for k in ("total", "high_count", "distinct_sources"):
            r[k] = int(r[k])
    return {"destinations": _iso(rows)}


def _tool_search_detections(inp):
    conds, params = [], []
    if inp.get("risk") in _ALLOWED_RISK:
        conds.append("risk_level = %s"); params.append(inp["risk"])
    if inp.get("type") in _ALLOWED_TYPE:
        conds.append("shadow_it_type = %s"); params.append(inp["type"])
    if inp.get("source") in _ALLOWED_SOURCE and detections_has_shadowit_cols():
        conds.append("detection_source = %s"); params.append(inp["source"])
    if inp.get("src_ip"):
        conds.append("src_ip = %s"); params.append(str(inp["src_ip"])[:45])
    if isinstance(inp.get("resolved"), bool):
        conds.append("is_resolved = %s"); params.append(inp["resolved"])
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    limit = min(50, max(1, int(inp.get("limit", 20))))
    params.append(limit)
    rows = execute(
        f"SELECT id, src_ip, src_mac, dst_domain, protocol, device_type, shadow_it_type, "
        f"risk_level, anomaly_score, is_resolved, detected_at FROM detections {where} "
        f"ORDER BY detected_at DESC LIMIT %s",
        params, fetch="all",
    ) or []
    return {"count": len(rows), "detections": _iso(rows)}


def _tool_top_offenders(inp):
    limit = min(10, max(1, int(inp.get("limit", 5))))
    rows = execute(
        """SELECT src_ip, COUNT(*) AS total,
                  SUM(CASE WHEN risk_level='high'   THEN 1 ELSE 0 END) AS high_count,
                  SUM(CASE WHEN risk_level='medium' THEN 1 ELSE 0 END) AS medium_count,
                  SUM(CASE WHEN is_resolved=FALSE   THEN 1 ELSE 0 END) AS open_count,
                  MAX(detected_at) AS last_seen
           FROM detections GROUP BY src_ip ORDER BY total DESC LIMIT %s""",
        (limit,), fetch="all",
    ) or []
    for r in rows:
        for k in ("total", "high_count", "medium_count", "open_count"):
            r[k] = int(r[k])
    return {"offenders": _iso(rows)}


def _tool_recent_audit(inp):
    limit = min(20, max(1, int(inp.get("limit", 10))))
    rows = execute(
        """SELECT al.action, al.target, al.ip_address, al.timestamp, u.username
           FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id
           ORDER BY al.timestamp DESC LIMIT %s""",
        (limit,), fetch="all",
    ) or []
    return {"entries": _iso(rows)}


# ── Live capture: monitor + control (host-only; needs Scapy/Npcap + Admin) ──────
def _assistant_audit(action, target):
    """Audit a control action taken via the assistant (best-effort)."""
    try:
        u = g.current_user
        _audit(u["user_id"], action, str(target)[:200], request.remote_addr)
    except Exception:
        log.warning("assistant control audit failed for %s", action)


def _tool_list_interfaces(_inp):
    from ml.collector import list_interfaces, SCAPY_AVAILABLE
    if not SCAPY_AVAILABLE:
        return {"error": "Live capture unavailable — Scapy/Npcap is not available on this host."}
    return {"interfaces": list_interfaces()}


def _tool_get_scan_status(_inp):
    from ml.collector import get_collector, SCAPY_AVAILABLE
    if not SCAPY_AVAILABLE:
        return {"running": False, "error": "Live capture unavailable (Scapy not installed)."}
    return get_collector().status()


def _tool_start_live_scan(inp):
    from ml.collector import get_collector, list_interfaces, SCAPY_AVAILABLE
    if not SCAPY_AVAILABLE:
        return {"error": "Live capture unavailable — run the backend as Administrator on the host with Npcap installed."}
    col   = get_collector()
    iface = inp.get("iface")
    if not iface:
        ifs = list_interfaces()
        iface = ifs[0]["device"] if ifs else None      # routing interface is first
    ok, msg = col.start(iface=iface)
    _assistant_audit("ASSISTANT_SCAN_START", f"iface: {iface or 'default'} — {msg}")
    return {"started": bool(ok), "message": msg, "iface": iface, "status": col.status()}


def _tool_stop_live_scan(_inp):
    from ml.collector import get_collector, SCAPY_AVAILABLE
    if not SCAPY_AVAILABLE:
        return {"error": "Live capture unavailable."}
    col = get_collector()
    if not col._running:
        return {"stopped": False, "message": "No scan is currently running.", "status": col.status()}
    col.stop()
    _assistant_audit("ASSISTANT_SCAN_STOP", "Live scan stopped via assistant")
    return {"stopped": True, "status": col.status()}


def _tool_analyze_now(_inp):
    from ml.collector import get_collector, SCAPY_AVAILABLE
    if not SCAPY_AVAILABLE:
        return {"error": "Live capture unavailable."}
    col     = get_collector()
    flushed = col.flush_all()
    raw     = col.pop_detections()
    if raw:
        insert_detections(raw)
        _assistant_audit("ASSISTANT_ANALYZE_NOW", f"{len(raw)} live anomalies saved")
    by_risk = {}
    for r in raw:
        by_risk[r.get("risk_level")] = by_risk.get(r.get("risk_level"), 0) + 1
    return {
        "flows_analysed": flushed,
        "new_detections": len(raw),
        "by_risk": by_risk,
        "sample": [
            {"src_ip": r.get("src_ip"), "dst_domain": r.get("dst_domain"),
             "risk": r.get("risk_level"), "type": r.get("shadow_it_type")}
            for r in raw[:10]
        ],
    }


_TOOL_FNS = {
    "get_summary":        _tool_get_summary,
    "search_detections":  _tool_search_detections,
    "top_offenders":      _tool_top_offenders,
    "top_destinations":   _tool_top_destinations,
    "recent_audit":       _tool_recent_audit,
    "list_interfaces":    _tool_list_interfaces,
    "get_scan_status":    _tool_get_scan_status,
    "start_live_scan":    _tool_start_live_scan,
    "stop_live_scan":     _tool_stop_live_scan,
    "analyze_now":        _tool_analyze_now,
}


def _run_tool(name, tool_input):
    fn = _TOOL_FNS.get(name)
    if not fn:
        return {"error": f"unknown tool {name}"}
    try:
        return fn(tool_input or {})
    except Exception as exc:
        log.exception("assistant tool %s failed", name)
        return {"error": f"tool failed: {exc}"}


def _audit(user_id, action, target, ip):
    execute(
        "INSERT INTO audit_logs (user_id, action, target, ip_address) VALUES (%s,%s,%s,%s)",
        (user_id, action, target, ip),
    )


@assistant_bp.route("/ask", methods=["POST"])
@token_required
@admin_required
@limiter.limit("20 per minute")
def ask():
    body     = request.get_json(silent=True) or {}
    question = str(body.get("question", "")).strip()
    if not question:
        return jsonify({"error": "Question is required"}), 400
    if len(question) > 2000:
        return jsonify({"error": "Question is too long (max 2000 chars)"}), 400

    if not os.getenv("ANTHROPIC_API_KEY"):
        return jsonify({"error": "Assistant not configured — set ANTHROPIC_API_KEY."}), 503

    try:
        import anthropic
    except ImportError:
        return jsonify({"error": "Assistant unavailable — the 'anthropic' package is not installed."}), 503

    # Prior conversation (multi-turn memory). Bounded for cost/safety: only the
    # last few text turns are replayed as context — tool calls are re-run fresh
    # for the new question.
    history = []
    raw_history = body.get("history")
    if isinstance(raw_history, list):
        for h in raw_history[-20:]:
            role, content = (h or {}).get("role"), (h or {}).get("content")
            if role in ("user", "assistant") and isinstance(content, str) and content.strip():
                history.append({"role": role, "content": content[:4000]})
    while history and history[0]["role"] != "user":   # Claude requires messages[0] == user
        history.pop(0)

    client   = anthropic.Anthropic()
    messages = history + [{"role": "user", "content": question}]
    tools_used = []

    try:
        for _ in range(MAX_TOOL_TURNS):
            resp = client.messages.create(
                model=ASSISTANT_MODEL,
                max_tokens=2048,
                system=SYSTEM_PROMPT,
                thinking={"type": "disabled"},
                tools=TOOLS,
                messages=messages,
            )
            if resp.stop_reason != "tool_use":
                break
            messages.append({"role": "assistant", "content": resp.content})
            results = []
            for block in resp.content:
                if block.type == "tool_use":
                    tools_used.append(block.name)
                    output = _run_tool(block.name, block.input)
                    results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(output, default=str),
                    })
            messages.append({"role": "user", "content": results})
        answer = "".join(b.text for b in resp.content if b.type == "text").strip()
    except anthropic.AuthenticationError:
        return jsonify({"error": "Assistant auth failed — check ANTHROPIC_API_KEY."}), 502
    except anthropic.RateLimitError:
        return jsonify({"error": "Assistant is rate-limited by the model API. Try again shortly."}), 429
    except anthropic.BadRequestError as exc:
        # Surface actionable model-side 400s (e.g. "credit balance too low") to the admin.
        msg = getattr(exc, "message", "") or str(exc)
        return jsonify({"error": f"Assistant unavailable: {msg}"}), 502
    except Exception:
        log.exception("assistant request failed")
        return jsonify({"error": "Assistant request failed. Check server logs."}), 502

    u = g.current_user
    _audit(u["user_id"], "ASSISTANT_QUERY", question[:200], request.remote_addr)

    return jsonify({
        "answer": answer or "(no answer produced)",
        "model": ASSISTANT_MODEL,
        "tools_used": sorted(set(tools_used)),
    })
