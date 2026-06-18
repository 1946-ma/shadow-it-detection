import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { BarChart2, PieChart as PieChartIcon, TrendingUp, Monitor, Play, FileText } from "lucide-react";
import StatsCards from "../components/StatsCards";
import AlertPanel from "../components/AlertPanel";
import { statsApi, detectionsApi, reportApi } from "../utils/api";
import { isAdmin } from "../utils/auth";

const CHART_COLORS = {
  software: "#3b82f6", hardware: "#8b5cf6", mixed: "#f59e0b",
  high: "#ef4444", medium: "#f59e0b", low: "#22c55e",
};

const TOOLTIP_STYLE = {
  background: "#1e293b",
  border: "1px solid #2d3f55",
  borderRadius: 8,
  color: "#f1f5f9",
  fontSize: 12,
};

const REFRESH_SECS = 30;

const relTime = (iso) => {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const RiskMiniBar = ({ high, medium, low, total }) => {
  const pct = (n) => total > 0 ? `${((n / total) * 100).toFixed(0)}%` : "0%";
  return (
    <div className="risk-mini-bar">
      <div style={{ width: pct(high),   background: "#ef4444" }} />
      <div style={{ width: pct(medium), background: "#f59e0b" }} />
      <div style={{ width: pct(low),    background: "#22c55e" }} />
    </div>
  );
};

const Dashboard = () => {
  const [stats,     setStats]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [running,   setRunning]   = useState(false);
  const [reporting, setReporting] = useState(false);
  const [msg,       setMsg]       = useState("");
  const [timeline,  setTimeline]  = useState([]);
  const [offenders, setOffenders] = useState([]);
  const [countdown, setCountdown] = useState(REFRESH_SECS);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await statsApi.get(); setStats(res.data); }
    catch (_) {} finally { setLoading(false); }
  }, []);

  const loadTimeline  = useCallback(() =>
    statsApi.timeline(30).then(r => setTimeline(r.data)).catch(() => {}), []);

  const loadOffenders = useCallback(() =>
    statsApi.topOffenders(10).then(r => setOffenders(r.data)).catch(() => {}), []);

  useEffect(() => { load(); },         [load]);
  useEffect(() => { loadTimeline(); },  [loadTimeline]);
  useEffect(() => { loadOffenders(); }, [loadOffenders]);

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { load(); loadTimeline(); loadOffenders(); return REFRESH_SECS; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [load, loadTimeline, loadOffenders]);

  const runDetection = async () => {
    setRunning(true); setMsg("");
    try {
      const r = await detectionsApi.runDetection();
      setMsg(r.data.message);
      load(); loadTimeline(); loadOffenders();
      setCountdown(REFRESH_SECS);
    } catch (e) {
      setMsg(e.response?.data?.error || "Detection failed");
    } finally { setRunning(false); }
  };

  const handleReport = async () => {
    setReporting(true);
    try {
      const res = await reportApi.generate();
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a   = document.createElement("a");
      a.href     = url;
      a.download = `shadow-it-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (_) {
      setMsg("Report generation failed.");
    } finally { setReporting(false); }
  };

  const byType = stats ? Object.entries(stats.by_type || {}).map(([k, v]) => ({ name: k, value: v })) : [];
  const byRisk = stats ? Object.entries(stats.by_risk || {}).map(([k, v]) => ({ name: k, value: v })) : [];
  const total  = stats?.total_detections || 0;

  return (
    <div className="page">

      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Shadow IT detection overview</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "var(--text2)" }}>
            Auto-refresh in {countdown}s
          </span>
          {isAdmin() && (
            <button className="btn btn-ghost" onClick={handleReport} disabled={reporting}>
              <FileText size={14} /> {reporting ? "Generating…" : "Export Report"}
            </button>
          )}
          {isAdmin() && (
            <button className="btn btn-primary" onClick={runDetection} disabled={running}>
              <Play size={14} /> {running ? "Scanning…" : "Run Detection"}
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className={`alert ${msg.toLowerCase().includes("fail") ? "alert-error" : "alert-success"}`}>
          {msg}
        </div>
      )}

      {/* Stats */}
      <StatsCards stats={stats} loading={loading} />

      {/* Charts */}
      <div className="dash-grid">
        <div className="card">
          <div className="section-hd">
            <div className="section-title">Detections by Type</div>
            {!loading && <span className="section-badge">{byType.reduce((s, e) => s + e.value, 0)} total</span>}
          </div>
          <div className="chart-wrap">
            {byType.length > 0 ? (
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={byType} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,.04)" }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {byType.map((e, i) => <Cell key={i} fill={CHART_COLORS[e.name] || "#3b82f6"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty" style={{ padding: "40px 0" }}>
                <div className="icon"><BarChart2 size={30} /></div>
                <p>No data yet</p>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="section-hd">
            <div className="section-title">Risk Breakdown</div>
            {!loading && <span className="section-badge">{total} detections</span>}
          </div>
          <div className="chart-wrap">
            {byRisk.length > 0 ? (
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie
                    data={byRisk} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={52} outerRadius={88}
                    paddingAngle={3}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {byRisk.map((e, i) => <Cell key={i} fill={CHART_COLORS[e.name] || "#94a3b8"} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend formatter={(v) => <span style={{ color: "#94a3b8", fontSize: 12 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty" style={{ padding: "40px 0" }}>
                <div className="icon"><PieChartIcon size={30} /></div>
                <p>No data yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-hd">
          <div className="section-title">Detection Timeline</div>
          <span className="section-badge">Last 30 days</span>
        </div>
        <div className="chart-wrap">
          {timeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={timeline} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="tlGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(d) => `Date: ${d}`}
                  formatter={(v) => [v, "Anomalies"]}
                  cursor={{ stroke: "rgba(59,130,246,.3)", strokeWidth: 1 }} />
                <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2}
                  fill="url(#tlGrad)" dot={false} activeDot={{ r: 4, fill: "#3b82f6" }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty" style={{ padding: "40px 0" }}>
              <div className="icon"><TrendingUp size={30} /></div>
              <p>No timeline data — run a detection first</p>
            </div>
          )}
        </div>
      </div>

      {/* Top Offenders */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-hd">
          <div className="section-title">Top Offending Devices</div>
          <span className="section-badge">{offenders.length} devices</span>
        </div>
        {offenders.length === 0 ? (
          <div className="empty" style={{ padding: "32px 0" }}>
            <div className="icon"><Monitor size={30} /></div>
            <p>No detections yet</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Source IP</th>
                  <th>Total</th>
                  <th>Risk Breakdown</th>
                  <th>Open</th>
                  <th>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {offenders.map((o, i) => (
                  <tr key={o.src_ip}>
                    <td style={{ color: "var(--text2)", fontSize: 12 }}>{i + 1}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600 }}>{o.src_ip}</td>
                    <td style={{ fontWeight: 600 }}>{o.total}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <RiskMiniBar high={o.high_count} medium={o.medium_count} low={o.low_count} total={o.total} />
                        <span style={{ fontSize: 11, color: "var(--text2)", whiteSpace: "nowrap" }}>
                          <span style={{ color: "#ef4444" }}>{o.high_count}H</span>
                          {" · "}
                          <span style={{ color: "#f59e0b" }}>{o.medium_count}M</span>
                          {" · "}
                          <span style={{ color: "#22c55e" }}>{o.low_count}L</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${o.open_count > 0 ? "badge-open" : "badge-resolved"}`}>
                        {o.open_count}
                      </span>
                    </td>
                    <td style={{ color: "var(--text2)", fontSize: 12 }}>{relTime(o.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Alerts */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-hd">
          <div className="section-title">Recent Alerts</div>
          <span className="section-badge">{stats?.recent_alerts?.length ?? 0} entries</span>
        </div>
        <AlertPanel alerts={stats?.recent_alerts || []} loading={loading} />
      </div>

    </div>
  );
};

export default Dashboard;
