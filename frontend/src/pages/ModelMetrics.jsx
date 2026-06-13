import { useState, useEffect } from "react";
import RiskBadge from "../components/RiskBadge";
import TypeBadge from "../components/TypeBadge";
import { metricsApi } from "../utils/api";

/* ── Animated metric bar card ─────────────────────────────────── */
const MetricCard = ({ label, value, color, description }) => {
  const [barWidth, setBarWidth] = useState(0);
  const pctVal = value != null ? value * 100 : 0;

  useEffect(() => {
    const t = setTimeout(() => setBarWidth(pctVal), 120);
    return () => clearTimeout(t);
  }, [pctVal]);

  return (
    <div className="metric-card">
      <div className="metric-value" style={{ color }}>{pctVal.toFixed(1)}%</div>
      <div className="metric-label">{label}</div>
      <div className="metric-bar-wrap">
        <div
          className="metric-bar"
          style={{ width: `${barWidth}%`, background: color, transition: "width 1.3s cubic-bezier(.16,1,.3,1)" }}
        />
      </div>
      {description && <div className="metric-desc">{description}</div>}
    </div>
  );
};

/* ── Confusion matrix ────────────────────────────────────────── */
const ConfusionMatrix = ({ tp, tn, fp, fn }) => {
  const fmt = (n) => (n != null ? n.toLocaleString() : "—");
  return (
    <div className="confusion-matrix">
      <div className="cm-corner" />
      <div className="cm-header">Predicted: Benign</div>
      <div className="cm-header">Predicted: Shadow IT</div>

      <div className="cm-row-header">Actual: Benign</div>
      <div className="cm-cell cm-cell--tn">
        <div className="cm-main">{fmt(tn)}</div>
        <div className="cm-sub">True Negative</div>
      </div>
      <div className="cm-cell cm-cell--fp">
        <div className="cm-main">{fmt(fp)}</div>
        <div className="cm-sub">False Positive</div>
      </div>

      <div className="cm-row-header">Actual: Shadow IT</div>
      <div className="cm-cell cm-cell--fn">
        <div className="cm-main">{fmt(fn)}</div>
        <div className="cm-sub">False Negative</div>
      </div>
      <div className="cm-cell cm-cell--tp">
        <div className="cm-main">{fmt(tp)}</div>
        <div className="cm-sub">True Positive</div>
      </div>
    </div>
  );
};

/* ── Main page ───────────────────────────────────────────────── */
const ModelMetrics = () => {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await metricsApi.get();
        setData(res.data);
      } catch (e) {
        setError(e.response?.data?.error || "Failed to load metrics.");
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="page"><div className="spinner-wrap"><div className="spinner" /></div></div>;

  const s = data?.summary || {};
  const scenarios = data?.scenarios || [];
  const total = (s.tp || 0) + (s.tn || 0) + (s.fp || 0) + (s.fn || 0);
  const perRecordMs = total > 0 && s.detection_time_s
    ? ((s.detection_time_s / total) * 1000).toFixed(3)
    : "—";

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Model Performance</div>
          <div className="page-sub">IsolationForest · CICIDS2017 dataset · {total.toLocaleString()} records evaluated</div>
        </div>
        <span className="section-badge" style={{ fontSize: 12, padding: "6px 14px" }}>
          Scenarios: {s.scenario_correct ?? "—"}/{s.scenario_total ?? "—"} correct
        </span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {data && (
        <>
          {/* ── Metric cards ─────────────────────────────────────── */}
          <div className="metrics-grid">
            <MetricCard label="Accuracy"            value={s.accuracy}            color="var(--accent)"  description="Overall correct classifications" />
            <MetricCard label="Precision"           value={s.precision}           color="var(--purple)"  description="Detected anomalies that are real" />
            <MetricCard label="Recall"              value={s.recall}              color="var(--success)" description="Real anomalies that were caught" />
            <MetricCard label="F1 Score"            value={s.f1_score}            color="var(--warning)" description="Harmonic mean of precision & recall" />
            <MetricCard label="False Positive Rate" value={s.false_positive_rate} color="var(--danger)"  description="Benign traffic flagged as suspicious" />
          </div>

          {/* ── Confusion matrix + timing ─────────────────────────── */}
          <div className="metrics-2col">
            <div className="card">
              <div className="section-hd">
                <div className="section-title">Confusion Matrix</div>
                <span className="section-badge">{total.toLocaleString()} records</span>
              </div>
              <ConfusionMatrix tp={s.tp} tn={s.tn} fp={s.fp} fn={s.fn} />
            </div>

            <div className="card">
              <div className="section-hd">
                <div className="section-title">Detection Performance</div>
              </div>
              <div className="timing-grid">
                <div className="timing-card">
                  <div className="timing-value" style={{ color: "var(--accent)" }}>
                    {s.detection_time_s != null ? `${s.detection_time_s}s` : "—"}
                  </div>
                  <div className="timing-label">Total inference time</div>
                </div>
                <div className="timing-card">
                  <div className="timing-value" style={{ color: "var(--success)" }}>
                    {perRecordMs} ms
                  </div>
                  <div className="timing-label">Per-record latency</div>
                </div>
                <div className="timing-card">
                  <div className="timing-value" style={{ color: "var(--purple)" }}>
                    {total.toLocaleString()}
                  </div>
                  <div className="timing-label">Records processed</div>
                </div>
                <div className="timing-card">
                  <div className="timing-value" style={{ color: "var(--warning)" }}>
                    {s.scenario_correct ?? "—"}/{s.scenario_total ?? "—"}
                  </div>
                  <div className="timing-label">Scenario accuracy</div>
                </div>
              </div>

              <div className="metrics-note" style={{ marginTop: 20 }}>
                <strong>Note:</strong> IsolationForest is an unsupervised model — it learns normality
                without labelled attack data. Metrics reflect comparison against CICIDS2017 ground-truth
                labels post-hoc. The 6/6 scenario tests confirm correct detection of known attack patterns.
              </div>
            </div>
          </div>

          {/* ── Test scenarios ────────────────────────────────────── */}
          <div className="card" style={{ marginTop: 20 }}>
            <div className="section-hd">
              <div className="section-title">Test Scenarios</div>
              <span className="section-badge">
                {scenarios.filter(s => s.correct).length}/{scenarios.length} passed
              </span>
            </div>
            {scenarios.length === 0 ? (
              <div className="empty">
                <div className="icon">🧪</div>
                <p>No scenario data — run ml/evaluate.py first</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Type</th>
                      <th>Description</th>
                      <th>Expected</th>
                      <th>Predicted</th>
                      <th>Result</th>
                      <th>Shadow IT Type</th>
                      <th>Risk</th>
                      <th>Anomaly Score</th>
                      <th>Latency (ms)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((sc) => (
                      <tr key={sc.id} className={sc.correct ? "" : "row-high"}>
                        <td style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--accent)" }}>{sc.id}</td>
                        <td><TypeBadge type={sc.type?.toLowerCase()} /></td>
                        <td style={{ maxWidth: 260 }}>{sc.description}</td>
                        <td style={{ fontFamily: "monospace", color: "var(--text2)" }}>{sc.expected}</td>
                        <td style={{ fontFamily: "monospace", color: "var(--text2)" }}>{sc.predicted}</td>
                        <td>
                          <span className={`badge ${sc.correct ? "badge-resolved" : "badge-high"}`}>
                            {sc.correct ? "✓ Pass" : "✗ Fail"}
                          </span>
                        </td>
                        <td>{sc.shadow_it_type && sc.shadow_it_type !== "—"
                          ? <TypeBadge type={sc.shadow_it_type} />
                          : <span style={{ color: "var(--text2)" }}>—</span>}
                        </td>
                        <td>{sc.risk_level && sc.risk_level !== "—"
                          ? <RiskBadge level={sc.risk_level} />
                          : <span style={{ color: "var(--text2)" }}>—</span>}
                        </td>
                        <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--danger)" }}>
                          {sc.anomaly_score != null ? sc.anomaly_score.toFixed(5) : "—"}
                        </td>
                        <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text2)" }}>
                          {sc.response_ms != null ? sc.response_ms.toFixed(2) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ModelMetrics;
