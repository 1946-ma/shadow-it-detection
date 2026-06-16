import { ClipboardList } from "lucide-react";

const fmt = (iso) => iso ? new Date(iso).toLocaleString() : "—";

const AuditLogTable = ({ logs = [], loading }) => {
  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>;
  if (!logs.length) return (
    <div className="empty"><div className="icon"><ClipboardList size={32} /></div><p>No audit entries found</p></div>
  );

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>User</th>
            <th>Action</th>
            <th>Target</th>
            <th>IP Address</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td style={{ color: "var(--text2)" }}>{l.id}</td>
              <td><strong>{l.username || "System"}</strong></td>
              <td>
                <span style={{
                  fontFamily: "monospace", fontSize: 12,
                  background: "var(--bg3)", padding: "2px 6px", borderRadius: 4
                }}>{l.action}</span>
              </td>
              <td style={{ color: "var(--text2)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {l.target || "—"}
              </td>
              <td style={{ fontFamily: "monospace", fontSize: 12 }}>{l.ip_address || "—"}</td>
              <td style={{ color: "var(--text2)", fontSize: 12 }}>{fmt(l.timestamp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AuditLogTable;
