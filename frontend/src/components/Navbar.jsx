import { useState, useEffect } from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { ShieldCheck, Bell, User, Wifi } from "lucide-react";
import { getUser, clearAuth } from "../utils/auth";
import { authApi, statsApi } from "../utils/api";

const Navbar = () => {
  const user     = getUser();
  const navigate = useNavigate();
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetch = () =>
      statsApi.alerts().then(r => setAlertCount(r.data.high_unresolved)).catch(() => {});
    fetch();
    const t = setInterval(fetch, 60_000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = async () => {
    try { await authApi.logout(); } catch (_) {}
    clearAuth();
    navigate("/login");
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <ShieldCheck size={17} />
        <span className="brand-text">Shadow IT Detection</span>
      </div>
      <div className="navbar-links">
        <NavLink to="/dashboard"     className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>Dashboard</NavLink>
        <NavLink to="/detections"    className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>Detections</NavLink>
        <NavLink to="/model-metrics" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>Model Metrics</NavLink>
        {user?.role === "admin" && (<>
          <NavLink to="/live-scan"  className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            <Wifi size={13} /> Live Scan
          </NavLink>
          <NavLink to="/audit-logs" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>Audit Log</NavLink>
        </>)}
      </div>
      <div className="navbar-right">
        <Link to="/detections?risk=high" className="bell-wrap" title="Unresolved high-risk alerts">
          <Bell size={16} />
          {alertCount > 0 && (
            <span className="bell-badge">{alertCount > 99 ? "99+" : alertCount}</span>
          )}
        </Link>
        <span className="user-chip"><User size={13} /> {user?.username} · {user?.role}</span>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: "5px 12px" }} onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
