import { Link } from "react-router-dom";
import RiskBadge from "./RiskBadge";
import TypeBadge from "./TypeBadge";

const fmt = (iso) =>
  iso ? new Date(iso).toLocaleString() : "—";

const AlertPanel = ({ alerts = [], loading }) => {
  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>;
  if (!alerts.length) return <div className="empty"><div className="icon">📭</div><p>No recent alerts</p></div>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Source IP</th>
            <th>Domain</th>
            <th>Type</th>
            <th>Risk</th>
            <th>Detected</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((a) => (
            <tr key={a.id}>
              <td><Link to={`/detections/${a.id}`}>#{a.id}</Link></td>
              <td style={{ fontFamily: "monospace" }}>{a.src_ip}</td>
              <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.dst_domain || "—"}
              </td>
              <td><TypeBadge type={a.shadow_it_type} /></td>
              <td><RiskBadge level={a.risk_level} /></td>
              <td style={{ color: "var(--text2)", fontSize: 12 }}>{fmt(a.detected_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AlertPanel;
