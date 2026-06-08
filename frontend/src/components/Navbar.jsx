import { NavLink, useNavigate } from "react-router-dom";
import { getUser, clearAuth } from "../utils/auth";
import { authApi } from "../utils/api";

const Navbar = () => {
  const user     = getUser();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try { await authApi.logout(); } catch (_) {}
    clearAuth();
    navigate("/login");
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <span>🛡️</span> Shadow IT
      </div>
      <div className="navbar-links">
        <NavLink to="/dashboard"   className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>Dashboard</NavLink>
        <NavLink to="/detections"  className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>Detections</NavLink>
        {user?.role === "admin" && (
          <NavLink to="/audit-logs" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>Audit Log</NavLink>
        )}
      </div>
      <div className="navbar-right">
        <span className="user-chip">👤 {user?.username} · {user?.role}</span>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: "5px 12px" }} onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
