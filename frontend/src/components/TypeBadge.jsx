const TypeBadge = ({ type }) => {
  const map   = { software: "badge-software", hardware: "badge-hardware", mixed: "badge-mixed" };
  const icons = { software: "💻", hardware: "🔌", mixed: "⚠️" };
  return (
    <span className={`badge ${map[type] || "badge-software"}`}>
      {icons[type] || "❓"} {type || "—"}
    </span>
  );
};
export default TypeBadge;
