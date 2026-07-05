import os, csv
from flask import Blueprint, jsonify
from backend.middleware.jwt_auth import token_required

metrics_bp = Blueprint("metrics", __name__)

REPORTS = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "ml", "reports",
)


def _read_csv(filename):
    path = os.path.join(REPORTS, filename)
    if not os.path.exists(path):
        return None
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


@metrics_bp.route("", methods=["GET"])
@token_required
def get_metrics():
    summary_rows = _read_csv("metrics_summary.csv")
    scenarios    = _read_csv("scenario_results.csv")

    if not summary_rows:
        return jsonify({"error": "No metrics found. Run ml/evaluate.py first."}), 404

    m = summary_rows[0]

    def _f(v):
        try:   return round(float(v), 4)
        except: return None

    def _i(v):
        try:   return int(v)
        except: return None

    summary = {
        "accuracy":            _f(m.get("accuracy")),
        "precision":           _f(m.get("precision")),
        "recall":              _f(m.get("recall")),
        "f1_score":            _f(m.get("f1_score")),
        "false_positive_rate": _f(m.get("false_positive_rate")),
        "roc_auc":             _f(m.get("roc_auc")),
        "tp":                  _i(m.get("tp")),
        "tn":                  _i(m.get("tn")),
        "fp":                  _i(m.get("fp")),
        "fn":                  _i(m.get("fn")),
        # Hybrid stage breakdown (IF = unsupervised anomaly stage, RF = supervised stage)
        "if_accuracy":         _f(m.get("if_accuracy")),
        "if_precision":        _f(m.get("if_precision")),
        "if_recall":           _f(m.get("if_recall")),
        "rf_accuracy":         _f(m.get("rf_accuracy")),
        "rf_precision":        _f(m.get("rf_precision")),
        "rf_recall":           _f(m.get("rf_recall")),
        "holdout_rows":        _i(m.get("holdout_rows")),
        "detection_time_s":    _f(m.get("detection_time_s")),
        "scenario_correct":    _i(m.get("scenario_correct")),
        "scenario_total":      _i(m.get("scenario_total")),
    }

    scenario_list = []
    if scenarios:
        for s in scenarios:
            scenario_list.append({
                "id":           s.get("id"),
                "type":         s.get("type"),
                "description":  s.get("description"),
                "expected":     _i(s.get("expected")),
                "predicted":    _i(s.get("predicted")),
                "correct":      s.get("correct", "").lower() == "true",
                "shadow_it_type": s.get("shadow_it_type"),
                "risk_level":   s.get("risk_level"),
                "anomaly_score": _f(s.get("anomaly_score")),
                "response_ms":  _f(s.get("response_ms")),
            })

    return jsonify({"summary": summary, "scenarios": scenario_list})
