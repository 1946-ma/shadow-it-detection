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

const Dashboard = () => {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [msg,     setMsg]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await statsApi.get();
      setStats(res.data);
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runDetection = async () => {
    setRunning(true); setMsg("");
    try {
      const r = await detectionsApi.runDetection();
      setMsg(`✅ ${r.data.message}`);
      load();
    } catch (e) {
      setMsg(`❌ ${e.response?.data?.error || "Detection failed"}`);
    } finally { setRunning(false); }
  };

  const byType = stats ? Object.entries(stats.by_type || {}).map(([k, v]) => ({ name: k, value: v })) : [];
  const byRisk = stats ? Object.entries(stats.by_risk || {}).map(([k, v]) => ({ name: k, value: v })) : [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Shadow IT detection overview</div>
        </div>
        {isAdmin() && (
          <button className="btn btn-primary" onClick={runDetection} disabled={running}>
            {running ? "Running…" : "▶ Run Detection"}
          </button>
        )}
      </div>

      {msg && <div className={`alert ${msg.startsWith("✅") ? "alert-success" : "alert-error"}`}>{msg}</div>}

      <StatsCards stats={stats} loading={loading} />

      <div className="dash-grid">
        <div className="card">
          <div className="card-title">Detections by Type</div>
          {byType.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byType} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: "#8b949e", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#8b949e", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#21262d", border: "1px solid #30363d", borderRadius: 8, color: "#e6edf3" }}
                  cursor={{ fill: "rgba(255,255,255,.04)" }}
                />
                <Bar dataKey="value" radius={[4,4,0,0]}>
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

        <div className="card">
          <div className="card-title">Risk Level Breakdown</div>
          {byRisk.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byRisk} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                  paddingAngle={3} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
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

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>Recent Alerts</div>
        <AlertPanel alerts={stats?.recent_alerts || []} loading={loading} />
      </div>
    </div>
  );
};

export default Dashboard;
