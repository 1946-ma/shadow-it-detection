import { useState, useEffect } from "react";

const useCountUp = (target, duration = 950) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const end = Number(target);
    if (target == null || isNaN(end)) return;
    if (end === 0) { setCount(0); return; }
    let startTime = null;
    const step = (ts) => {
      if (!startTime) startTime = ts;
      const p = Math.min((ts - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(eased * end));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return target == null ? "—" : count;
};

const Card = ({ label, value, color, variant }) => {
  const display = useCountUp(value);
  return (
    <div className={`stat-card${variant ? ` stat-card--${variant}` : ""}`}>
      <div className="stat-value" style={{ color }}>{display}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
};

const StatsCards = ({ stats, loading }) => {
  if (loading) return (
    <div className="stats-grid">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="stat-card stat-card--skeleton">
          <div className="skeleton" style={{ height: 40, width: "52%", borderRadius: 6, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 11, width: "72%", borderRadius: 4 }} />
        </div>
      ))}
    </div>
  );

  if (!stats) return null;
  const bt = stats.by_type || {};
  const br = stats.by_risk || {};

  return (
    <div className="stats-grid">
      <Card label="Total Detections"   value={stats.total_detections} color="var(--accent)"  variant="accent"  />
      <Card label="Unresolved"         value={stats.unresolved}       color="var(--danger)"  variant="danger"  />
      <Card label="Resolved"           value={stats.resolved}         color="var(--success)" variant="success" />
      <Card label="Software Shadow IT" value={bt.software ?? 0}       color="var(--accent)"  variant="accent"  />
      <Card label="Hardware Shadow IT" value={bt.hardware ?? 0}       color="var(--purple)"  variant="purple"  />
      <Card label="High Risk"          value={br.high ?? 0}           color="var(--danger)"  variant="danger"  />
    </div>
  );
};

export default StatsCards;
