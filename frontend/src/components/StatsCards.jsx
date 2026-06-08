const Card = ({ label, value, color }) => (
  <div className="stat-card">
    <div className="stat-value" style={{ color }}>{value ?? "—"}</div>
    <div className="stat-label">{label}</div>
  </div>
);

const StatsCards = ({ stats, loading }) => {
  if (loading) return (
    <div className="stats-grid">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="stat-card" style={{ opacity: .4 }}>
          <div className="stat-value">—</div>
          <div className="stat-label">Loading…</div>
        </div>
      ))}
    </div>
  );

  if (!stats) return null;
  const bt = stats.by_type || {};
  const br = stats.by_risk || {};

  return (
    <div className="stats-grid">
      <Card label="Total Detections" value={stats.total_detections} color="var(--accent)" />
      <Card label="Unresolved"       value={stats.unresolved}       color="var(--danger)" />
      <Card label="Resolved"         value={stats.resolved}         color="var(--success)" />
      <Card label="Software Shadow IT" value={bt.software ?? 0}    color="var(--accent)" />
      <Card label="Hardware Shadow IT" value={bt.hardware ?? 0}    color="var(--purple)" />
      <Card label="High Risk"        value={br.high ?? 0}           color="var(--danger)" />
    </div>
  );
};

export default StatsCards;
