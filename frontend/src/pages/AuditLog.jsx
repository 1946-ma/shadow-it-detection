import { useState, useEffect, useCallback } from "react";
import AuditLogTable from "../components/AuditLogTable";
import { auditApi } from "../utils/api";

/* ── Integrity status badge ──────────────────────────────────── */
const IntegrityBadge = ({ result }) => {
  if (!result) return null;

  if (result.status === "ok") {
    return (
      <div className="integrity-badge integrity-badge--ok">
        <span className="integrity-icon">✓</span>
        <div>
          <div className="integrity-title">Chain Intact</div>
          <div className="integrity-sub">
            {result.hashed_entries} entries verified
            {result.legacy_entries > 0 && ` · ${result.legacy_entries} pre-integrity`}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="integrity-badge integrity-badge--fail">
      <span className="integrity-icon">✗</span>
      <div>
        <div className="integrity-title">Chain Compromised</div>
        <div className="integrity-sub">
          Tampered entries: #{result.broken_ids?.join(", #")}
        </div>
      </div>
    </div>
  );
};

const AuditLog = () => {
  const [logs,      setLogs]      = useState([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [integrity, setIntegrity] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await auditApi.list({ page, per_page: 25 });
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
    } catch (_) {}
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const handleVerify = async () => {
    setVerifying(true);
    setIntegrity(null);
    try {
      const res = await auditApi.verify();
      setIntegrity(res.data);
    } catch (e) {
      setIntegrity({ status: "error", message: e.response?.data?.error || "Verification failed" });
    } finally { setVerifying(false); }
  };

  const totalPages = Math.ceil(total / 25);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Audit Log</div>
          <div className="page-sub">{total.toLocaleString()} total entries — append-only, hash-chained</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            className="btn btn-ghost"
            onClick={handleVerify}
            disabled={verifying}
            title="Verify SHA-256 hash chain integrity"
          >
            {verifying ? "Verifying…" : "🔐 Verify Integrity"}
          </button>
          <button className="btn btn-ghost" onClick={load} disabled={loading}>↻ Refresh</button>
        </div>
      </div>

      {integrity && <IntegrityBadge result={integrity} />}

      {integrity?.status === "error" && (
        <div className="alert alert-error">{integrity.message}</div>
      )}

      <div className="card">
        <AuditLogTable logs={logs} loading={loading} />

        {totalPages > 1 && (
          <div className="pagination">
            <button className="btn btn-ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              ← Prev
            </button>
            <span>Page {page} of {totalPages}</span>
            <button className="btn btn-ghost" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLog;
