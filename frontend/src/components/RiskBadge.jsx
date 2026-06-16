import { Circle } from "lucide-react";

const COLORS = { high: "var(--danger)", medium: "var(--warning)", low: "var(--success)" };
const MAP    = { high: "badge-high",    medium: "badge-medium",   low: "badge-low" };

const RiskBadge = ({ level }) => (
  <span className={`badge ${MAP[level] || "badge-low"}`}>
    <Circle size={8} fill={COLORS[level] || "var(--text2)"} stroke="none" />
    {" "}{level || "—"}
  </span>
);

export default RiskBadge;
