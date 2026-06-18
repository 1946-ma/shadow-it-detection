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

const COLORS = {
  software: "#58a6ff", hardware: "#bc8cff", mixed: "#d29922",
  high: "#f85149", medium: "#d29922", low: "#3fb950",
};

const REFRESH_SECS = 30;

const fmt = (d) =>
  d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const relTime = (iso) => {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

/* ── Countdown ring ──────────────────────────────────────────── */
const CountdownRing = ({ value, max }) => {
  const r      = 10;
  const circ   = 2 * Math.PI * r;
  const offset = circ * (1 - value / max);
  return (
    <div className="refresh-ring">
      <svg width="26" height="26" viewBox="0 0 26 26">
        <circle cx="13" cy="13" r={r} className="ring-track" />
        <circle
          cx="13" cy="13" r={r}
          className="ring-fill"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 13 13)"
        />
      </svg>
      <span>Refresh in {value}s</span>
    </div>
  );
};

/* ── Mini risk bar ────────────────────────────────────────────── */
const RiskMiniBar = ({ high, medium, low, total }) => {
  const pct = (n) => total > 0 ? `${((n / total) * 100).toFixed(0)}%` : "0%";
  return (
    <div className="risk-mini-bar">
      <div style={{ width: pct(high),   background: "var(--danger)"  }} />
      <div style={{ width: pct(medium), background: "var(--warning)" }} />
      <div style={{ width: pct(low),    background: "var(--success)" }} />
    </div>
  );
};

const Dashboard = () => {
  const [stats,     setStats]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [running,   setRunning]   = useState(false);
  const [msg,       setMsg]       = useState("");
  const [now,       setNow]       = useState(new Date());
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

  /* live clock */
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  /* auto-refresh countdown */
  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          load();
          loadTimeline();
          loadOffenders();
          return REFRESH_SECS;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [load, loadTimeline, loadOffenders]);

  const runDetection = async () => {
    setRunning(true); setMsg("");
    try {
      const r = await detectionsApi.runDetection();
      setMsg(`Detection complete — ${r.data.message}`);
      load(); loadTimeline(); loadOffenders();
      setCountdown(REFRESH_SECS);
    } catch (e) {
      setMsg(e.response?.data?.error || "Detection failed");
    } finally { setRunning(false); }
  };

  const [reporting, setReporting] = useState(false);
  const handleReport = async () => {
    setReporting(true);
    try {
      const res = await reportApi.generate();
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a   = document.createElement("a");
      a.href     = url;
      a.download = `shadow-it-report-${new Date().toISOString().slice(0,10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMsg("Report generation failed.");
    } finally { setReporting(false); }
  };

  const byType = stats ? Object.entries(stats.by_type || {}).map(([k, v]) => ({ name: k, value: v })) : [];
  const byRisk = stats ? Object.entries(stats.by_risk || {}).map(([k, v]) => ({ name: k, value: v })) : [];

  const total      = stats?.total_detections || 0;
  const highCount  = stats?.by_risk?.high || 0;
  const threatPct  = total > 0 ? Math.min(100, Math.round((highCount / total) * 100)) : 0;
  const threatColor =
    threatPct > 60 ? "var(--danger)" :
    threatPct > 30 ? "var(--warning)" : "var(--success)";
  const threatLabel =
    threatPct > 60 ? "CRITICAL" :
    threatPct > 30 ? "ELEVATED" : "NORMAL";

  return (
    <div className="page">
      {/* ── Moving background ──────────────────────────────────────────── */}
      <div className="dash-bg" aria-hidden="true">
        <div className="dash-bg-grid" />
        <div className="dash-bg-scan" />
        <div className="dash-bg-orb dash-bg-orb--1" />
        <div className="dash-bg-orb dash-bg-orb--2" />
        <div className="dash-bg-orb dash-bg-orb--3" />
      </div>

      <div className="dash-content">

        <div className="activity-bar"><div className="activity-bar-fill" /></div>

        {/* header */}
        <div className="page-header">
          <div>
            <div className="page-title" style={{ display: "flex", alignItems: "center" }}>
              Dashboard
              <span className="live-badge"><span className="live-dot" />LIVE</span>
            </div>
            <div className="page-sub" style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
              Shadow IT detection overview
              <span className="live-time">{fmt(now)}</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <CountdownRing value={countdown} max={REFRESH_SECS} />
            {isAdmin() && (
              <button className="btn btn-ghost" onClick={handleReport} disabled={reporting}>
                <FileText size={13} /> {reporting ? "Generating…" : "Export Report"}
              </button>
            )}
            {isAdmin() && (
              <button
                className={`btn btn-primary${running ? "" : " btn-run-idle"}`}
                onClick={runDetection}
                disabled={running}
              >
                {running ? "Scanning…" : <><Play size={13} /> Run Detection</>}
              </button>
            )}
          </div>
        </div>

        {msg && (
          <div className={`alert ${msg.startsWith("Detection complete") ? "alert-success" : "alert-error"}`}>
            {msg}
          </div>
        )}

        {/* threat meter */}
        {!loading && stats && (
          <div className="threat-bar">
            <span className="threat-label-tag">Threat Level</span>
            <div className="threat-meter">
              <div className="threat-fill" style={{ width: `${threatPct}%`, background: threatColor }} />
            </div>
            <span className="threat-value" style={{ color: threatColor }}>{threatLabel}</span>
            <div className="threat-segs">
              <span className="threat-seg">
                <span className="threat-seg-dot" style={{ background: "var(--danger)" }} />
                High {stats.by_risk?.high ?? 0}
              </span>
              <span className="threat-seg">
                <span className="threat-seg-dot" style={{ background: "var(--warning)" }} />
                Med {stats.by_risk?.medium ?? 0}
              </span>
              <span className="threat-seg">
                <span className="threat-seg-dot" style={{ background: "var(--success)" }} />
                Low {stats.by_risk?.low ?? 0}
              </span>
            </div>
          </div>
        )}

        <StatsCards stats={stats} loading={loading} />

        {/* charts */}
        <div className="dash-grid">
          <div className="card">
            <div className="section-hd">
              <div className="section-title">Detections by Type</div>
              {!loading && <span className="section-badge">{byType.reduce((s, e) => s + e.value, 0)} total</span>}
            </div>
            <div className="chart-wrap">
              <div className="chart-scan" />
              {byType.length > 0 ? (
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={byType} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fill: "#8b949e", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#8b949e", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: "#21262d", border: "1px solid #30363d", borderRadius: 8, color: "#e6edf3" }}
                      cursor={{ fill: "rgba(255,255,255,.04)" }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {byType.map((e, i) => <Cell key={i} fill={COLORS[e.name] || "#58a6ff"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty" style={{ padding: "40px 0" }}>
                  <div className="icon"><BarChart2 size={32} /></div><p>No data yet</p>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="section-hd">
              <div className="section-title">Risk Breakdown</div>
              {!loading && <span className="section-badge" style={{ color: threatColor }}>{threatLabel}</span>}
            </div>
            <div className="chart-wrap">
              <div className="chart-scan" style={{ animationDelay: "4s" }} />
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
                      {byRisk.map((e, i) => <Cell key={i} fill={COLORS[e.name] || "#8b949e"} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "#21262d", border: "1px solid #30363d", borderRadius: 8, color: "#e6edf3" }}
                    />
                    <Legend formatter={(v) => <span style={{ color: "#8b949e", fontSize: 12 }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty" style={{ padding: "40px 0" }}>
                  <div className="icon"><PieChartIcon size={32} /></div><p>No data yet</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* timeline */}
        <div className="card" style={{ marginTop: 20 }}>
          <div className="section-hd">
            <div className="section-title">Detection Timeline</div>
            <span className="section-badge">Last 30 days</span>
          </div>
          <div className="chart-wrap">
            <div className="chart-scan" style={{ animationDelay: "2s" }} />
            {timeline.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={timeline} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tlGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#58a6ff" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#58a6ff" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fill: "#8b949e", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fill: "#8b949e", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#21262d", border: "1px solid #30363d", borderRadius: 8, color: "#e6edf3" }}
                    labelFormatter={(d) => `Date: ${d}`}
                    formatter={(v) => [v, "Anomalies"]}
                    cursor={{ stroke: "rgba(88,166,255,.3)", strokeWidth: 1 }}
                  />
                  <Area type="monotone" dataKey="count" stroke="#58a6ff" strokeWidth={2} fill="url(#tlGrad)" dot={false} activeDot={{ r: 4, fill: "#58a6ff" }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty" style={{ padding: "40px 0" }}>
                <div className="icon"><TrendingUp size={32} /></div>
                <p>No timeline data yet — run a detection first</p>
              </div>
            )}
          </div>
        </div>

        {/* top offenders */}
        <div className="card" style={{ marginTop: 20 }}>
          <div className="section-hd">
            <div className="section-title">Top Offenders</div>
            <span className="section-badge">{offenders.length} devices</span>
          </div>
          {offenders.length === 0 ? (
            <div className="empty" style={{ padding: "32px 0" }}>
              <div className="icon"><Monitor size={32} /></div><p>No detections yet</p>
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
                    <tr key={o.src_ip} className={o.high_count > 0 ? "row-high" : ""}>
                      <td style={{ color: "var(--text2)", fontSize: 12 }}>{i + 1}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600 }}>{o.src_ip}</td>
                      <td style={{ fontWeight: 700, color: "var(--accent)" }}>{o.total}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <RiskMiniBar high={o.high_count} medium={o.medium_count} low={o.low_count} total={o.total} />
                          <span style={{ fontSize: 11, color: "var(--text2)", whiteSpace: "nowrap" }}>
                            <span style={{ color: "var(--danger)" }}>{o.high_count}H</span>
                            {" · "}
                            <span style={{ color: "var(--warning)" }}>{o.medium_count}M</span>
                            {" · "}
                            <span style={{ color: "var(--success)" }}>{o.low_count}L</span>
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

        {/* recent alerts */}
        <div className="card" style={{ marginTop: 20 }}>
          <div className="section-hd">
            <div className="section-title">Recent Alerts</div>
            <span className="section-badge">{stats?.recent_alerts?.length ?? 0} entries</span>
          </div>
          <AlertPanel alerts={stats?.recent_alerts || []} loading={loading} highGlow />
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
