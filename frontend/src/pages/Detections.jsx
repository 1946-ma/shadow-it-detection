import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { Search, Download } from "lucide-react";
import RiskBadge from "../components/RiskBadge";
import TypeBadge from "../components/TypeBadge";
import { detectionsApi } from "../utils/api";

const fmt = (iso) => iso ? new Date(iso).toLocaleString() : "—";

const Detections = () => {
  const location = useLocation();
  const initRisk = new URLSearchParams(location.search).get("risk") || "";

  const [detections, setDetections] = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(true);
  const [exporting,  setExporting]  = useState(false);

  const [filters, setFilters] = useState({ type: "", risk: initRisk, date_from: "", date_to: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, per_page: 20 };
      if (filters.type)      params.type      = filters.type;
      if (filters.risk)      params.risk      = filters.risk;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to)   params.date_to   = filters.date_to;
      const res = await detectionsApi.list(params);
      setDetections(res.data.detections || []);
      setTotal(res.data.total || 0);
    } catch (_) {}
    finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  const applyFilters = (e) => { e.preventDefault(); setPage(1); load(); };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = {};
      if (filters.type)      params.type      = filters.type;
      if (filters.risk)      params.risk      = filters.risk;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to)   params.date_to   = filters.date_to;
      const res = await detectionsApi.export(params);
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a   = document.createElement("a");
      a.href     = url;
      a.download = "detections.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (_) {} finally { setExporting(false); }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Detections</div>
          <div className="page-sub">{total.toLocaleString()} total anomalies logged</div>
        </div>
        <button className="btn btn-ghost" onClick={handleExport} disabled={exporting || total === 0}>
          <Download size={14} /> {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={applyFilters}>
          <div className="form-row" style={{ alignItems: "flex-end" }}>
            <div className="form-group">
              <label>Shadow IT Type</label>
              <select value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}>
                <option value="">All Types</option>
                <option value="software">Software</option>
                <option value="hardware">Hardware</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
            <div className="form-group">
              <label>Risk Level</label>
              <select value={filters.risk} onChange={e => setFilters(f => ({ ...f, risk: e.target.value }))}>
                <option value="">All Risks</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="form-group">
              <label>From Date</label>
              <input type="datetime-local" value={filters.date_from}
                onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>To Date</label>
              <input type="datetime-local" value={filters.date_to}
                onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} />
            </div>
            <button type="submit" className="btn btn-primary">Filter</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setFilters({ type:"", risk:"", date_from:"", date_to:"" }); setPage(1); }}>
              Clear
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        {loading ? (
          <div className="spinner-wrap"><div className="spinner" /></div>
        ) : detections.length === 0 ? (
          <div className="empty"><div className="icon"><Search size={32} /></div><p>No detections found</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Source IP</th>
                  <th>MAC Address</th>
                  <th>Domain</th>
                  <th>Type</th>
                  <th>Risk</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Detected At</th>
                </tr>
              </thead>
              <tbody>
                {detections.map((d) => (
                  <tr key={d.id}>
                    <td><Link to={`/detections/${d.id}`}>#{d.id}</Link></td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{d.src_ip}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{d.src_mac || "—"}</td>
                    <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.dst_domain || "—"}
                    </td>
                    <td><TypeBadge type={d.shadow_it_type} /></td>
                    <td><RiskBadge level={d.risk_level} /></td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {d.anomaly_score != null ? d.anomaly_score.toFixed(4) : "—"}
                    </td>
                    <td>
                      <span className={`badge ${d.is_resolved ? "badge-resolved" : "badge-open"}`}>
                        {d.is_resolved ? "Resolved" : "Open"}
                      </span>
                    </td>
                    <td style={{ color: "var(--text2)", fontSize: 12 }}>{fmt(d.detected_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="pagination">
            <button className="btn btn-ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              Prev
            </button>
            <span>Page {page} of {totalPages}</span>
            <button className="btn btn-ghost" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Detections;
