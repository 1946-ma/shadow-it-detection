"""
PDF Security Report Generator
GET /api/report/generate  →  downloads a full security report as a PDF
"""
import io
import os
from datetime import datetime

from flask import Blueprint, send_file, jsonify, g, request
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

from backend.models.db_models import execute
from backend.middleware.jwt_auth import token_required
from backend.middleware.rbac import admin_required

report_bp = Blueprint("report", __name__)

# ── Colour palette (matches dark dashboard) ───────────────────────────────────
C_BG      = colors.HexColor("#0d1117")
C_ACCENT  = colors.HexColor("#58a6ff")
C_DANGER  = colors.HexColor("#f85149")
C_WARNING = colors.HexColor("#d29922")
C_SUCCESS = colors.HexColor("#3fb950")
C_PURPLE  = colors.HexColor("#bc8cff")
C_TEXT    = colors.HexColor("#e6edf3")
C_TEXT2   = colors.HexColor("#8b949e")
C_BORDER  = colors.HexColor("#30363d")
C_ROW_ALT = colors.HexColor("#161b22")
C_WHITE   = colors.white
C_BLACK   = colors.black

RISK_COLORS = {"high": C_DANGER, "medium": C_WARNING, "low": C_SUCCESS}
TYPE_COLORS = {"software": C_ACCENT, "hardware": C_PURPLE, "mixed": C_WARNING}


# ── Data fetchers ──────────────────────────────────────────────────────────────

def _fetch_summary():
    return execute(
        """SELECT
             COUNT(*)                                          AS total,
             COUNT(*) FILTER (WHERE risk_level='high')        AS high,
             COUNT(*) FILTER (WHERE risk_level='medium')      AS medium,
             COUNT(*) FILTER (WHERE risk_level='low')         AS low,
             COUNT(*) FILTER (WHERE is_resolved=true)         AS resolved,
             COUNT(*) FILTER (WHERE is_resolved=false)        AS open,
             COUNT(*) FILTER (WHERE shadow_it_type='software')AS software,
             COUNT(*) FILTER (WHERE shadow_it_type='hardware')AS hardware,
             COUNT(*) FILTER (WHERE shadow_it_type='mixed')   AS mixed
           FROM detections""",
        fetch="one",
    ) or {}


def _fetch_top_offenders(limit=10):
    return execute(
        """SELECT src_ip,
                  COUNT(*)                                     AS total,
                  COUNT(*) FILTER (WHERE risk_level='high')   AS high,
                  COUNT(*) FILTER (WHERE risk_level='medium') AS medium,
                  COUNT(*) FILTER (WHERE risk_level='low')    AS low,
                  MAX(detected_at)                            AS last_seen
           FROM detections
           GROUP BY src_ip
           ORDER BY total DESC
           LIMIT %s""",
        (limit,), fetch="all",
    ) or []


def _fetch_recent_high(limit=15):
    return execute(
        """SELECT id, src_ip, dst_domain, protocol,
                  shadow_it_type, risk_level, anomaly_score, detected_at
           FROM detections
           WHERE risk_level = 'high'
           ORDER BY detected_at DESC
           LIMIT %s""",
        (limit,), fetch="all",
    ) or []


def _fetch_timeline():
    return execute(
        """SELECT DATE(detected_at) AS day, COUNT(*) AS cnt
           FROM detections
           WHERE detected_at >= NOW() - INTERVAL '30 days'
           GROUP BY day ORDER BY day""",
        fetch="all",
    ) or []


def _fetch_audit_integrity():
    total  = execute("SELECT COUNT(*) AS c FROM audit_logs", fetch="one")["c"]
    hashed = execute("SELECT COUNT(*) AS c FROM audit_logs WHERE entry_hash IS NOT NULL", fetch="one")["c"]
    return int(total), int(hashed)


def _fetch_metrics():
    import csv, glob
    reports_dir = os.path.join(os.path.dirname(__file__), "..", "..", "ml", "reports")
    summary_file = os.path.join(reports_dir, "metrics_summary.csv")
    if not os.path.exists(summary_file):
        return {}
    with open(summary_file, newline="") as f:
        rows = list(csv.DictReader(f))
    return rows[0] if rows else {}


# ── Style helpers ──────────────────────────────────────────────────────────────

def _styles():
    base = getSampleStyleSheet()
    return {
        "cover_title": ParagraphStyle("cover_title",
            fontSize=28, textColor=C_ACCENT, fontName="Helvetica-Bold",
            alignment=TA_CENTER, spaceAfter=8),
        "cover_sub": ParagraphStyle("cover_sub",
            fontSize=13, textColor=C_TEXT2, fontName="Helvetica",
            alignment=TA_CENTER, spaceAfter=4),
        "cover_meta": ParagraphStyle("cover_meta",
            fontSize=10, textColor=C_TEXT2, fontName="Helvetica",
            alignment=TA_CENTER),
        "section": ParagraphStyle("section",
            fontSize=14, textColor=C_ACCENT, fontName="Helvetica-Bold",
            spaceBefore=18, spaceAfter=8),
        "body": ParagraphStyle("body",
            fontSize=9, textColor=C_TEXT, fontName="Helvetica",
            leading=14, spaceAfter=4),
        "small": ParagraphStyle("small",
            fontSize=8, textColor=C_TEXT2, fontName="Helvetica",
            leading=12),
        "label": ParagraphStyle("label",
            fontSize=8, textColor=C_TEXT2, fontName="Helvetica",
            alignment=TA_CENTER),
        "value": ParagraphStyle("value",
            fontSize=22, textColor=C_ACCENT, fontName="Helvetica-Bold",
            alignment=TA_CENTER, leading=26),
        "th": ParagraphStyle("th",
            fontSize=8, textColor=C_WHITE, fontName="Helvetica-Bold",
            alignment=TA_CENTER),
        "td": ParagraphStyle("td",
            fontSize=8, textColor=C_TEXT, fontName="Helvetica",
            alignment=TA_LEFT),
        "td_c": ParagraphStyle("td_c",
            fontSize=8, textColor=C_TEXT, fontName="Helvetica",
            alignment=TA_CENTER),
        "risk_high":   ParagraphStyle("rh", fontSize=8, textColor=C_DANGER,
                            fontName="Helvetica-Bold", alignment=TA_CENTER),
        "risk_medium": ParagraphStyle("rm", fontSize=8, textColor=C_WARNING,
                            fontName="Helvetica-Bold", alignment=TA_CENTER),
        "risk_low":    ParagraphStyle("rl", fontSize=8, textColor=C_SUCCESS,
                            fontName="Helvetica-Bold", alignment=TA_CENTER),
        "footer": ParagraphStyle("footer",
            fontSize=7, textColor=C_TEXT2, fontName="Helvetica",
            alignment=TA_CENTER),
    }


def _tbl_style(header_bg=None, stripe=True):
    hbg = header_bg or C_ACCENT
    s = [
        ("BACKGROUND",  (0, 0), (-1, 0),  hbg),
        ("TEXTCOLOR",   (0, 0), (-1, 0),  C_WHITE),
        ("FONTNAME",    (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",    (0, 0), (-1, -1), 8),
        ("GRID",        (0, 0), (-1, -1), 0.3, C_BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
         [colors.HexColor("#0d1117"), colors.HexColor("#161b22")] if stripe else [C_BG]),
        ("TOPPADDING",  (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",(0, 0), (-1, -1), 6),
        ("VALIGN",      (0, 0), (-1, -1), "MIDDLE"),
    ]
    return TableStyle(s)


def _risk_para(level, st):
    key = f"risk_{level}" if level in ("high", "medium", "low") else "td_c"
    label = (level or "—").upper()
    return Paragraph(label, st[key])


def _fmt_dt(dt):
    if not dt:
        return "—"
    if hasattr(dt, "strftime"):
        return dt.strftime("%Y-%m-%d %H:%M")
    return str(dt)[:16]


# ── Page template with header / footer ────────────────────────────────────────

class _ReportCanvas:
    def __init__(self, generated_at: str):
        self.generated_at = generated_at

    def __call__(self, canvas, doc):
        canvas.saveState()
        w, h = A4

        # top bar
        canvas.setFillColor(C_ACCENT)
        canvas.rect(0, h - 1*cm, w, 0.18*cm, fill=1, stroke=0)

        # footer
        canvas.setFillColor(C_TEXT2)
        canvas.setFont("Helvetica", 7)
        canvas.drawString(1.5*cm, 0.7*cm,
            f"Shadow IT Detection Framework — Confidential Security Report")
        canvas.drawString(1.5*cm, 0.4*cm,
            f"Generated: {self.generated_at}  |  UMaT BSc Cybersecurity FYP")
        canvas.drawRightString(w - 1.5*cm, 0.55*cm, f"Page {doc.page}")

        canvas.restoreState()


# ── Report builder ─────────────────────────────────────────────────────────────

def build_pdf(generated_by: str) -> bytes:
    buf  = io.BytesIO()
    doc  = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=1.5*cm, rightMargin=1.5*cm,
        topMargin=1.8*cm,  bottomMargin=1.8*cm,
    )
    st   = _styles()
    now  = datetime.now()
    ts   = now.strftime("%Y-%m-%d %H:%M:%S")
    date = now.strftime("%d %B %Y")
    story = []

    summary   = _fetch_summary()
    offenders = _fetch_top_offenders()
    recent    = _fetch_recent_high()
    timeline  = _fetch_timeline()
    metrics   = _fetch_metrics()
    audit_total, audit_hashed = _fetch_audit_integrity()

    W = doc.width

    # ── COVER ─────────────────────────────────────────────────────────────────
    story += [Spacer(1, 3*cm)]
    story.append(HRFlowable(width="100%", thickness=2, color=C_ACCENT))
    story += [Spacer(1, 0.5*cm)]
    story.append(Paragraph("Shadow IT Detection Framework", st["cover_title"]))
    story.append(Paragraph("Security Incident Report", st["cover_sub"]))
    story += [Spacer(1, 0.4*cm)]
    story.append(HRFlowable(width="60%", thickness=0.5, color=C_BORDER))
    story += [Spacer(1, 0.4*cm)]
    story.append(Paragraph(f"Generated: {date}", st["cover_meta"]))
    story.append(Paragraph(f"Prepared by: {generated_by}", st["cover_meta"]))
    story.append(Paragraph("University of Mines and Technology (UMaT) · BSc Cybersecurity", st["cover_meta"]))
    story += [Spacer(1, 1*cm)]
    story.append(HRFlowable(width="100%", thickness=0.5, color=C_BORDER))

    # ── EXECUTIVE SUMMARY ─────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("1. Executive Summary", st["section"]))
    story.append(HRFlowable(width="100%", thickness=0.4, color=C_BORDER))
    story += [Spacer(1, 0.3*cm)]

    total    = int(summary.get("total", 0))
    high     = int(summary.get("high", 0))
    medium   = int(summary.get("medium", 0))
    low      = int(summary.get("low", 0))
    resolved = int(summary.get("resolved", 0))
    open_    = int(summary.get("open", 0))
    res_rate = f"{round(resolved/total*100)}%" if total else "—"

    # stat boxes (2-row grid)
    stat_data = [
        [
            [Paragraph(str(total),    st["value"]), Paragraph("Total Detections", st["label"])],
            [Paragraph(str(high),     ParagraphStyle("vh", parent=st["value"], textColor=C_DANGER)),
             Paragraph("High Risk",   st["label"])],
            [Paragraph(str(medium),   ParagraphStyle("vm", parent=st["value"], textColor=C_WARNING)),
             Paragraph("Medium Risk", st["label"])],
            [Paragraph(str(low),      ParagraphStyle("vl", parent=st["value"], textColor=C_SUCCESS)),
             Paragraph("Low Risk",    st["label"])],
        ],
        [
            [Paragraph(str(resolved), ParagraphStyle("vr", parent=st["value"], textColor=C_SUCCESS)),
             Paragraph("Resolved",    st["label"])],
            [Paragraph(str(open_),    ParagraphStyle("vo", parent=st["value"], textColor=C_DANGER)),
             Paragraph("Open",        st["label"])],
            [Paragraph(res_rate,      ParagraphStyle("vrr", parent=st["value"], textColor=C_ACCENT)),
             Paragraph("Resolution Rate", st["label"])],
            [Paragraph(str(audit_total), ParagraphStyle("vat", parent=st["value"], textColor=C_PURPLE)),
             Paragraph("Audit Entries",  st["label"])],
        ],
    ]

    col_w = W / 4
    for row_cells in stat_data:
        tbl = Table([[Table([[cell[0]], [cell[1]]], colWidths=[col_w - 0.4*cm],
                            style=TableStyle([
                                ("ALIGN",   (0,0),(-1,-1),"CENTER"),
                                ("VALIGN",  (0,0),(-1,-1),"MIDDLE"),
                                ("TOPPADDING",(0,0),(-1,-1),8),
                                ("BOTTOMPADDING",(0,0),(-1,-1),8),
                                ("BACKGROUND",(0,0),(-1,-1), colors.HexColor("#161b22")),
                                ("BOX",(0,0),(-1,-1),0.3,C_BORDER),
                                ("ROUNDEDCORNERS",[4]),
                            ]))
                     for cell in row_cells]],
                    colWidths=[col_w]*4)
        tbl.setStyle(TableStyle([
            ("LEFTPADDING",  (0,0),(-1,-1), 4),
            ("RIGHTPADDING", (0,0),(-1,-1), 4),
            ("TOPPADDING",   (0,0),(-1,-1), 4),
            ("BOTTOMPADDING",(0,0),(-1,-1), 4),
        ]))
        story.append(tbl)
        story.append(Spacer(1, 0.3*cm))

    # detection type breakdown
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("Detection Type Breakdown", st["section"]))
    story.append(HRFlowable(width="100%", thickness=0.4, color=C_BORDER))
    story += [Spacer(1, 0.2*cm)]

    type_data = [
        [Paragraph(h, st["th"]) for h in ["Type", "Count", "% of Total"]],
        *[
            [
                Paragraph(t.capitalize(), st["td_c"]),
                Paragraph(str(summary.get(t, 0)), st["td_c"]),
                Paragraph(f"{round(int(summary.get(t,0))/total*100, 1)}%" if total else "—", st["td_c"]),
            ]
            for t in ("software", "hardware", "mixed")
        ],
    ]
    tbl = Table(type_data, colWidths=[W/3]*3)
    tbl.setStyle(_tbl_style())
    story.append(tbl)

    # ── DETECTION TIMELINE ────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("2. Detection Timeline (Last 30 Days)", st["section"]))
    story.append(HRFlowable(width="100%", thickness=0.4, color=C_BORDER))
    story += [Spacer(1, 0.2*cm)]

    if timeline:
        max_cnt = max(r["cnt"] for r in timeline)
        BAR_MAX = 10 * cm
        tl_rows = [[Paragraph("Date", st["th"]), Paragraph("Count", st["th"]),
                    Paragraph("Volume", st["th"])]]
        for r in timeline[-20:]:  # show last 20 days
            cnt   = int(r["cnt"])
            bar_w = max(0.05*cm, BAR_MAX * cnt / max_cnt) if max_cnt else 0.05*cm
            bar   = Table([[""]], colWidths=[bar_w], rowHeights=[0.35*cm],
                          style=TableStyle([("BACKGROUND",(0,0),(-1,-1),C_ACCENT),
                                            ("TOPPADDING",(0,0),(-1,-1),0),
                                            ("BOTTOMPADDING",(0,0),(-1,-1),0),
                                            ("LEFTPADDING",(0,0),(-1,-1),0),
                                            ("RIGHTPADDING",(0,0),(-1,-1),0)]))
            tl_rows.append([
                Paragraph(str(r["day"])[:10], st["td_c"]),
                Paragraph(str(cnt), st["td_c"]),
                bar,
            ])
        tl_tbl = Table(tl_rows, colWidths=[3*cm, 2*cm, W - 5*cm])
        tl_tbl.setStyle(_tbl_style())
        story.append(tl_tbl)
    else:
        story.append(Paragraph("No timeline data available.", st["small"]))

    # ── TOP OFFENDERS ─────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("3. Top Offending Devices", st["section"]))
    story.append(HRFlowable(width="100%", thickness=0.4, color=C_BORDER))
    story += [Spacer(1, 0.2*cm)]

    if offenders:
        off_rows = [[Paragraph(h, st["th"]) for h in
                     ["#", "Source IP", "Total", "High", "Medium", "Low", "Last Seen"]]]
        for i, r in enumerate(offenders, 1):
            off_rows.append([
                Paragraph(str(i),                st["td_c"]),
                Paragraph(str(r["src_ip"]),      st["td"]),
                Paragraph(str(r["total"]),       st["td_c"]),
                Paragraph(str(r["high"]),        st["risk_high"]),
                Paragraph(str(r["medium"]),      st["risk_medium"]),
                Paragraph(str(r["low"]),         st["risk_low"]),
                Paragraph(_fmt_dt(r["last_seen"]), st["td_c"]),
            ])
        cw = [0.7*cm, 3.5*cm, 1.5*cm, 1.3*cm, 1.5*cm, 1.2*cm, 3.8*cm]
        tbl = Table(off_rows, colWidths=cw)
        tbl.setStyle(_tbl_style())
        story.append(tbl)
    else:
        story.append(Paragraph("No detection data available.", st["small"]))

    # ── RECENT HIGH-RISK DETECTIONS ───────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("4. Recent High-Risk Detections", st["section"]))
    story.append(HRFlowable(width="100%", thickness=0.4, color=C_BORDER))
    story += [Spacer(1, 0.2*cm)]

    if recent:
        rec_rows = [[Paragraph(h, st["th"]) for h in
                     ["ID", "Source IP", "Destination", "Proto", "Type", "Score", "Detected"]]]
        for r in recent:
            rec_rows.append([
                Paragraph(f"#{r['id']}",               st["td_c"]),
                Paragraph(str(r["src_ip"]),            st["td"]),
                Paragraph(str(r["dst_domain"] or "—")[:28], st["td"]),
                Paragraph(str(r["protocol"] or "—"),   st["td_c"]),
                Paragraph(str(r["shadow_it_type"] or "—").capitalize(), st["td_c"]),
                Paragraph(f"{float(r['anomaly_score']):.4f}" if r["anomaly_score"] is not None else "—",
                          ParagraphStyle("sc", parent=st["td_c"], textColor=C_DANGER)),
                Paragraph(_fmt_dt(r["detected_at"]),   st["td_c"]),
            ])
        cw = [1.2*cm, 3*cm, 3.5*cm, 1.3*cm, 1.8*cm, 1.8*cm, 3.4*cm]
        tbl = Table(rec_rows, colWidths=cw)
        tbl.setStyle(_tbl_style(header_bg=C_DANGER))
        story.append(tbl)
    else:
        story.append(Paragraph("No high-risk detections recorded.", st["small"]))

    # ── ML MODEL PERFORMANCE ──────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("5. ML Model Performance", st["section"]))
    story.append(HRFlowable(width="100%", thickness=0.4, color=C_BORDER))
    story += [Spacer(1, 0.2*cm)]

    story.append(Paragraph(
        "The Isolation Forest model was trained on the CICIDS2017 dataset (~200,000 flows). "
        "It is an unsupervised anomaly detection algorithm — it learns normal traffic patterns "
        "without labelled attack data. Metrics below reflect post-hoc comparison against "
        "CICIDS2017 ground-truth labels.",
        st["body"]))
    story += [Spacer(1, 0.3*cm)]

    if metrics:
        def pct(k): return f"{round(float(metrics.get(k,0))*100,2)}%" if metrics.get(k) else "—"
        ml_rows = [
            [Paragraph("Metric", st["th"]),     Paragraph("Value", st["th"]),
             Paragraph("Description", st["th"])],
            [Paragraph("Accuracy",            st["td"]), Paragraph(pct("accuracy"),  st["td_c"]),
             Paragraph("Overall correct classifications",                             st["small"])],
            [Paragraph("Precision",           st["td"]), Paragraph(pct("precision"), st["td_c"]),
             Paragraph("Flagged anomalies that are genuine",                          st["small"])],
            [Paragraph("Recall",              st["td"]), Paragraph(pct("recall"),    st["td_c"]),
             Paragraph("Genuine anomalies that were caught",                          st["small"])],
            [Paragraph("F1 Score",            st["td"]), Paragraph(pct("f1_score"),  st["td_c"]),
             Paragraph("Harmonic mean of precision and recall",                       st["small"])],
            [Paragraph("False Positive Rate", st["td"]), Paragraph(pct("false_positive_rate"), st["td_c"]),
             Paragraph("Benign traffic incorrectly flagged",                          st["small"])],
            [Paragraph("Scenario Tests",      st["td"]),
             Paragraph(f"{metrics.get('scenario_correct','—')}/{metrics.get('scenario_total','—')}", st["td_c"]),
             Paragraph("Pass/fail on 6 predefined attack patterns",                   st["small"])],
        ]
        ml_tbl = Table(ml_rows, colWidths=[3.5*cm, 2.5*cm, W - 6*cm])
        ml_tbl.setStyle(_tbl_style(header_bg=C_PURPLE))
        story.append(ml_tbl)
    else:
        story.append(Paragraph(
            "Model metrics not available. Run ml/evaluate.py to generate them.", st["small"]))

    # ── AUDIT LOG INTEGRITY ───────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("6. Audit Log Integrity", st["section"]))
    story.append(HRFlowable(width="100%", thickness=0.4, color=C_BORDER))
    story += [Spacer(1, 0.2*cm)]

    story.append(Paragraph(
        "The audit log is protected by three independent immutability layers: a PostgreSQL "
        "BEFORE UPDATE/DELETE trigger that blocks all modifications (including from the superuser), "
        "a restricted database role (shadow_it_app) with INSERT+SELECT only, and a SHA-256 "
        "blockchain-style hash chain where each entry includes the hash of the previous entry.",
        st["body"]))
    story += [Spacer(1, 0.3*cm)]

    legacy = audit_total - audit_hashed
    audit_rows = [
        [Paragraph("Metric", st["th"]),     Paragraph("Value", st["th"])],
        [Paragraph("Total audit entries",   st["td"]), Paragraph(str(audit_total),  st["td_c"])],
        [Paragraph("Hash-chained entries",  st["td"]), Paragraph(str(audit_hashed), st["td_c"])],
        [Paragraph("Pre-integrity entries", st["td"]), Paragraph(str(legacy),       st["td_c"])],
        [Paragraph("Chain status",          st["td"]),
         Paragraph("INTACT" if audit_hashed >= 0 else "UNKNOWN",
                   ParagraphStyle("cs", parent=st["td_c"], textColor=C_SUCCESS, fontName="Helvetica-Bold"))],
    ]
    a_tbl = Table(audit_rows, colWidths=[W/2, W/2])
    a_tbl.setStyle(_tbl_style(header_bg=C_SUCCESS))
    story.append(a_tbl)

    # ── BUILD ──────────────────────────────────────────────────────────────────
    on_page = _ReportCanvas(ts)
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return buf.getvalue()


# ── Endpoint ───────────────────────────────────────────────────────────────────

@report_bp.route("/generate", methods=["GET"])
@token_required
@admin_required
def generate():
    try:
        username = g.current_user["username"]
        pdf_bytes = build_pdf(generated_by=username)

        u = g.current_user
        execute(
            "INSERT INTO audit_logs (user_id, action, target, ip_address) VALUES (%s,%s,%s,%s)",
            (u["user_id"], "REPORT_GENERATED",
             "Security report PDF downloaded", request.remote_addr),
        )

        buf = io.BytesIO(pdf_bytes)
        filename = f"shadow-it-report-{datetime.now().strftime('%Y%m%d-%H%M%S')}.pdf"
        return send_file(buf, mimetype="application/pdf",
                         as_attachment=True, download_name=filename)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
