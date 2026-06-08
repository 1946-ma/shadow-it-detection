import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import DeviceProfile from "../components/DeviceProfile";
import RiskBadge from "../components/RiskBadge";
import TypeBadge from "../components/TypeBadge";
import { detectionsApi } from "../utils/api";
import { isAdmin } from "../utils/auth";

const fmt = (iso) => iso ? new Date(iso).toLocaleString() : "—";

const DetectionDetail = () => {
  const { id }   = useParams();
  const navigate = useNavigate();
  const [det,     setDet]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [msg,     setMsg]     = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await detectionsApi.get(id);
        setDet(res.data);
      } catch (e) {
        if (e.response?.status === 404) navigate("/detections");
      } finally { setLoading(false); }
    })();
  }, [id, navigate]);

  const handleResolve = async () => {
    setResolving(true); setMsg("");
    try {
      await detectionsApi.resolve(id);
      setDet(d => ({ ...d, is_resolved: true }));
      setMsg("Detection marked as resolved.");
    } catch (e) {
      setMsg(e.response?.data?.error || "Failed to resolve.");
    } finally { setResolving(false); }
  };

  if (loading) return <div className="page"><div className="spinner-wrap"><div className="spinner" /></div></div>;
  if (!det)    return null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Link to="/detections" style={{ color: "var(--text2)", fontSize: 13 }}>← All Detections</Link>
          <div className="page-title" style={{ marginTop: 4 }}>Detection #{det.id}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <TypeBadge type={det.shadow_it_type} />
            <RiskBadge level={det.risk_level} />
            <span className={`badge ${det.is_resolved ? "badge-resolved" : "badge-open"}`}>
              {det.is_resolved ? "Resolved" : "Open"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <span style={{ color: "var(--text2)", fontSize: 12 }}>Detected: {fmt(det.detected_at)}</span>
          {isAdmin() && !det.is_resolved && (
            <button className="btn btn-success" onClick={handleResolve} disabled={resolving}>
              {resolving ? "Resolving…" : "✓ Mark Resolved"}
            </button>
          )}
        </div>
      </div>

      {msg && <div className={`alert ${msg.includes("resolved") ? "alert-success" : "alert-error"}`}>{msg}</div>}

      <DeviceProfile detection={det} />
    </div>
  );
};

export default DetectionDetail;
