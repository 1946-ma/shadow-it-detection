import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import StatsCards from "../components/StatsCards";
import AlertPanel from "../components/AlertPanel";
import { statsApi, detectionsApi } from "../utils/api";
import { isAdmin } from "../utils/auth";

const COLORS = {
  software: "#58a6ff", hardware: "#bc8cff", mixed: "#d29922",
  high: "#f85149", medium: "#d29922", low: "#3fb950",
};

const fmt = (d) =>
  d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const Dashboard = () => {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [msg,     setMsg]     = useState("");
  const [now,     setNow]     = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await statsApi.get();
      setStats(res.data);
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* live clock */
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const runDetection = async () => {
    setRunning(true); setMsg("");
    try {
      const r = await detectionsApi.runDetection();
      setMsg(`Detection complete — ${r.data.message}`);
      load();
    } catch (e) {
      setMsg(e.response?.data?.error || "Detection failed");
    } finally { setRunning(false); }
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

      {/* ── All content above background ──────────────────────────────── */}
      <div className="dash-content">

        {/* activity pulse line */}
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
            {isAdmin() && (
              <button
                className={`btn btn-primary${running ? "" : " btn-run-idle"}`}
                onClick={runDetection}
                disabled={running}
              >
                {running ? "Scanning…" : "▶ Run Detection"}
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

        {/* stats */}
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
                  <div className="icon">📊</div><p>No data yet</p>
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
                  <div className="icon">🥧</div><p>No data yet</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* recent alerts */}
        <div className="card" style={{ marginTop: 20 }}>
          <div className="section-hd">
            <div className="section-title">Recent Alerts</div>
            <span className="section-badge">
              {stats?.recent_alerts?.length ?? 0} entries
            </span>
          </div>
          <AlertPanel alerts={stats?.recent_alerts || []} loading={loading} highGlow />
        </div>

      </div>{/* end dash-content */}
    </div>
  );
};

export default Dashboard;
