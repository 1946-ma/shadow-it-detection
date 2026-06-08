import RiskBadge from "./RiskBadge";
import TypeBadge from "./TypeBadge";

const Row = ({ k, v }) => (
  <div className="detail-row">
    <span className="detail-key">{k}</span>
    <span className="detail-val">{v ?? "—"}</span>
  </div>
);

const ScoreBar = ({ score }) => {
  const norm = Math.min(1, Math.max(0, Math.abs(score) / 0.3));
  const color = norm > 0.6 ? "var(--danger)" : norm > 0.3 ? "var(--warning)" : "var(--success)";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text2)", marginBottom: 4 }}>
        <span>Anomaly Score</span><span>{score?.toFixed(5)}</span>
      </div>
      <div className="score-bar-wrap">
        <div className="score-bar" style={{ width: `${norm * 100}%`, background: color }} />
      </div>
    </div>
  );
};

const DeviceProfile = ({ detection }) => {
  if (!detection) return null;
  const d = detection;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card">
        <div className="card-title">Network Identity</div>
        <Row k="Source IP"   v={<code>{d.src_ip}</code>} />
        <Row k="MAC Address" v={<code>{d.src_mac}</code>} />
        <Row k="Device Type" v={d.device_type} />
        <Row k="Authorised"  v={d.is_authorized ? "Yes" : "No"} />
      </div>
      <div className="card">
        <div className="card-title">Traffic Details</div>
        <Row k="Destination Domain" v={d.dst_domain} />
        <Row k="Protocol"           v={d.protocol} />
        <Row k="Bytes Sent"         v={d.bytes_sent?.toLocaleString() + " B"} />
        <Row k="Bytes Received"     v={d.bytes_received?.toLocaleString() + " B"} />
        <Row k="Duration"           v={d.duration + " s"} />
      </div>
      <div className="card">
        <div className="card-title">Threat Classification</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <TypeBadge type={d.shadow_it_type} />
          <RiskBadge level={d.risk_level} />
        </div>
        <ScoreBar score={d.anomaly_score} />
      </div>
    </div>
  );
};

export default DeviceProfile;
