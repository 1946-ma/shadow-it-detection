import { useState, useEffect, useCallback } from "react";
import AuditLogTable from "../components/AuditLogTable";
import { auditApi } from "../utils/api";

const AuditLog = () => {
  const [logs,    setLogs]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);

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

  const totalPages = Math.ceil(total / 25);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Audit Log</div>
          <div className="page-sub">{total.toLocaleString()} total entries — read-only</div>
        </div>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>↻ Refresh</button>
      </div>

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
