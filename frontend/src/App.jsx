import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { isAuthenticated } from "./utils/auth";
import Login           from "./pages/Login";
import Navbar          from "./components/Navbar";
import Dashboard       from "./pages/Dashboard";
import Detections      from "./pages/Detections";
import DetectionDetail from "./pages/DetectionDetail";
import AuditLog        from "./pages/AuditLog";
import ModelMetrics    from "./pages/ModelMetrics";
import LiveScan        from "./pages/LiveScan";

const Shell = ({ children }) => (
  <div className="app-shell">
    <Navbar />
    {children}
  </div>
);

const Private = ({ children }) =>
  isAuthenticated() ? children : <Navigate to="/login" replace />;

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/login"          element={<Login />} />
      <Route path="/"               element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard"      element={<Private><Shell><Dashboard /></Shell></Private>} />
      <Route path="/detections"     element={<Private><Shell><Detections /></Shell></Private>} />
      <Route path="/detections/:id" element={<Private><Shell><DetectionDetail /></Shell></Private>} />
      <Route path="/audit-logs"     element={<Private><Shell><AuditLog /></Shell></Private>} />
      <Route path="/model-metrics"  element={<Private><Shell><ModelMetrics /></Shell></Private>} />
      <Route path="/live-scan"      element={<Private><Shell><LiveScan /></Shell></Private>} />
      <Route path="*"               element={<Navigate to="/dashboard" replace />} />
    </Routes>
  </BrowserRouter>
);

export default App;
