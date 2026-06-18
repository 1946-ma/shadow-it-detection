import { useState, useEffect, useRef, useCallback } from "react";
import { Wifi, WifiOff, Play, Square, RefreshCw, Radio } from "lucide-react";
import RiskBadge from "../components/RiskBadge";
import TypeBadge from "../components/TypeBadge";
import { scanApi } from "../utils/api";

const POLL_MS = 5000;

const StatBox = ({ label, value, color, style }) => (
  <div className="scan-stat" style={style}>
    <div className="scan-stat-val" style={{ color }}>{value}</div>
    <div className="scan-stat-label">{label}</div>
  </div>
);

const fmt = (iso) => iso ? new Date(iso).toLocaleTimeString() : "—";

const LiveScan = () => {
  const [interfaces, setInterfaces] = useState([]);
  const [iface,      setIface]      = useState("");
  const [status,     setStatus]     = useState({ running: false });
  const [detections, setDetections] = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [ifaceErr,   setIfaceErr]   = useState("");

  const pollRef = useRef(null);

  /* ── Load interfaces once ─────────────────────────────────────── */
  useEffect(() => {
    scanApi.interfaces()
      .then(r => {
        setInterfaces(r.data.interfaces || []);
        if (r.data.interfaces?.length) setIface(r.data.interfaces[0]);
      })
      .catch(e => setIfaceErr(e.response?.data?.error || "Could not list interfaces"));

    scanApi.status().then(r => setStatus(r.data)).catch(() => {});
  }, []);

  /* ── Poll when running ────────────────────────────────────────── */
  const poll = useCallback(async () => {
    try {
      const [st, det] = await Promise.all([scanApi.status(), scanApi.detections()]);
      setStatus(st.data);
      if (det.data.count > 0) {
        setDetections(prev => [
          ...det.data.detections.map(d => ({ ...d, _ts: new Date().toISOString() })),
          ...prev,
        ].slice(0, 200));
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (status.running) {
      pollRef.current = setInterval(poll, POLL_MS);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [status.running, poll]);

  /* ── Controls ─────────────────────────────────────────────────── */
  const handleStart = async () => {
    setLoading(true); setError("");
    try {
      const r = await scanApi.start(iface || null);
      setStatus(r.data.status);
    } catch (e) {
      setError(e.response?.data?.error || "Failed to start scan");
    } finally { setLoading(false); }
  };

  const handleStop = async () => {
    setLoading(true); setError("");
    try {
      const r = await scanApi.stop();
      setStatus(r.data.status || { running: false });
    } catch (e) {
      setError(e.response?.data?.error || "Failed to stop scan");
    } finally { setLoading(false); }
  };

  const handleFlush = async () => {
    setLoading(true); setError("");
    try {
      await scanApi.flush();
      await poll();
    } catch (e) {
      setError(e.response?.data?.error || "Flush failed");
    } finally { setLoading(false); }
  };

  const fmtUptime = (s) => {
    if (!s) return "0s";
    const sec = Math.floor(s);
    if (sec < 60)   return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  };

  return (
    <div className="page">

      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            Live Network Scan
            {status.running && (
              <span className="live-badge"><span className="live-dot" />CAPTURING</span>
            )}
          </div>
          <div className="page-sub">
            Real-time packet capture · IsolationForest anomaly detection
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {status.running && (
            <button className="btn btn-ghost" onClick={handleFlush} disabled={loading}
              title="Force-analyse all active flows right now">
              <RefreshCw size={14} /> Analyze Now
            </button>
          )}
          {!status.running ? (
            <button className="btn btn-primary" onClick={handleStart} disabled={loading}>
              <Play size={14} /> {loading ? "Starting…" : "Start Scan"}
            </button>
          ) : (
            <button className="btn btn-danger" onClick={handleStop} disabled={loading}>
              <Square size={14} /> {loading ? "Stopping…" : "Stop Scan"}
            </button>
          )}
        </div>
      </div>

      {error    && <div className="alert alert-error">{error}</div>}
      {ifaceErr && <div className="alert alert-error">{ifaceErr} — is Npcap installed?</div>}
      {status.errors?.length > 0 && (
        <div className="alert alert-error">
          Capture error: {status.errors[status.errors.length - 1]}
          {status.errors[0]?.includes("permission") && " — run Flask as Administrator"}
        </div>
      )}
      {status.running && status.packets_seen === 0 && (
        <div className="alert alert-error">
          No packets captured yet — try a different interface from the dropdown, then stop and restart the scan.
        </div>
      )}

      {/* Config + Stats */}
      <div className="scan-top">
        {/* Interface selector */}
        <div className="card scan-config">
          <div className="section-title" style={{ marginBottom: 12 }}>Capture Interface</div>
          {interfaces.length > 0 ? (
            <select
              value={iface}
              onChange={e => setIface(e.target.value)}
              disabled={status.running}
            >
              {interfaces.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          ) : (
            <div style={{ color: "var(--text2)", fontSize: 13 }}>
              No interfaces found — install Npcap and restart Flask as Administrator.
            </div>
          )}
          <div className="scan-hint">
            Flows are analysed every 10 s after 30 s of inactivity. Anomalous flows are saved to Detections.
          </div>
        </div>

        {/* Live stats */}
        <div className="card scan-stats-card">
          <div className="section-title" style={{ marginBottom: 12 }}>
            {status.running
              ? <><Radio size={13} style={{ color: "var(--danger)" }} /> Live Stats</>
              : "Last Session Stats"}
          </div>
          <div className="scan-stats">
            <StatBox label="Packets Seen"   value={status.packets_seen   ?? 0} color="var(--accent)"  />
            <StatBox label="Flows Analysed" value={status.flows_analysed ?? 0} color="var(--purple)"  />
            <StatBox label="Active Flows"   value={status.active_flows   ?? 0} color="var(--warning)" />
            <StatBox label="Anomalies Found" value={status.detections_found ?? detections.length} color="var(--danger)"  />
            <StatBox label="Uptime"          value={fmtUptime(status.uptime_s)} color="var(--success)" style={{ minWidth: 120 }} />
          </div>
        </div>
      </div>

      {/* How it works */}
      {!status.running && detections.length === 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="section-title" style={{ marginBottom: 14 }}>How Live Detection Works</div>
          <div className="scan-steps">
            <div className="scan-step">
              <div className="scan-step-num">1</div>
              <div>
                <strong>Packet Capture</strong>
                <p>Scapy captures every IP packet on the selected interface in real time.</p>
              </div>
            </div>
            <div className="scan-step">
              <div className="scan-step-num">2</div>
              <div>
                <strong>Flow Assembly</strong>
                <p>Packets are grouped into bidirectional flows by (src IP, dst IP, src port, dst port, protocol). Each flow accumulates until 30 s of silence.</p>
              </div>
            </div>
            <div className="scan-step">
              <div className="scan-step-num">3</div>
              <div>
                <strong>Feature Extraction</strong>
                <p>20 statistical features are computed per flow — the same features used in CICIDS2017 training data (flow rate, packet sizes, TCP flags, window sizes, IAT, etc.).</p>
              </div>
            </div>
            <div className="scan-step">
              <div className="scan-step-num">4</div>
              <div>
                <strong>IsolationForest Scoring</strong>
                <p>The trained model scores each flow. Flows the model cannot explain as "normal" (score &lt; threshold) are flagged as anomalies and saved to Detections.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detection feed */}
      {(status.running || detections.length > 0) && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="section-hd">
            <div className="section-title">
              {status.running
                ? <><Radio size={13} style={{ color: "var(--danger)", marginRight: 6 }} />Live Anomalies</>
                : "Captured Anomalies"}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="section-badge">{detections.length} flagged</span>
              {detections.length > 0 && (
                <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setDetections([])}>
                  <RefreshCw size={12} /> Clear
                </button>
              )}
            </div>
          </div>

          {detections.length === 0 ? (
            <div className="empty" style={{ padding: "40px 0" }}>
              <div className="icon">
                {status.running ? <Wifi size={32} /> : <WifiOff size={32} />}
              </div>
              <p>{status.running
                ? `Capturing… polling every ${POLL_MS / 1000}s for anomalies`
                : "No anomalies captured in this session"}
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Source IP</th>
                    <th>Destination</th>
                    <th>Protocol</th>
                    <th>Type</th>
                    <th>Risk</th>
                    <th>Score</th>
                    <th>Bytes Sent</th>
                    <th>Bytes Recv</th>
                  </tr>
                </thead>
                <tbody>
                  {detections.map((d, i) => (
                    <tr key={i} className={d.risk_level === "high" ? "row-high" : ""}>
                      <td style={{ color: "var(--text2)", fontSize: 12, whiteSpace: "nowrap" }}>
                        {fmt(d._ts)}
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{d.src_ip}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {d.dst_domain}
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{d.protocol}</td>
                      <td><TypeBadge type={d.shadow_it_type} /></td>
                      <td><RiskBadge level={d.risk_level} /></td>
                      <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--danger)" }}>
                        {d.anomaly_score?.toFixed(4)}
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{d.bytes_sent?.toLocaleString()}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{d.bytes_received?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LiveScan;
