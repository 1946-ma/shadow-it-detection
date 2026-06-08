const RiskBadge = ({ level }) => {
  const map = { high: "badge-high", medium: "badge-medium", low: "badge-low" };
  const icons = { high: "🔴", medium: "🟡", low: "🟢" };
  return (
    <span className={`badge ${map[level] || "badge-low"}`}>
      {icons[level] || "⚪"} {level || "—"}
    </span>
  );
};
export default RiskBadge;
