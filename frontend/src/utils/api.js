import axios from "axios";
import { getToken, clearAuth } from "./auth";

const BASE = process.env.REACT_APP_API_URL || "";

const api = axios.create({ baseURL: BASE });

api.interceptors.request.use((cfg) => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      clearAuth();
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login:  (username, password) => api.post("/api/auth/login",  { username, password }),
  logout: ()                   => api.post("/api/auth/logout"),
};

export const detectionsApi = {
  list:         (params) => api.get("/api/detections",             { params }),
  get:          (id)     => api.get(`/api/detections/${id}`),
  resolve:      (id)     => api.patch(`/api/detections/${id}/resolve`),
  runDetection: ()       => api.post("/api/run-detection"),
  export:       (params) => api.get("/api/detections/export",      { params, responseType: "blob" }),
};

export const statsApi = {
  get:          ()              => api.get("/api/stats"),
  timeline:     (days = 30)     => api.get("/api/stats/timeline",      { params: { days } }),
  alerts:       ()              => api.get("/api/stats/alerts"),
  topOffenders: (limit = 10)    => api.get("/api/stats/top-offenders", { params: { limit } }),
};

export const metricsApi = {
  get: () => api.get("/api/metrics"),
};

export const auditApi = {
  list:   (params) => api.get("/api/audit-logs",        { params }),
  verify: ()       => api.get("/api/audit-logs/verify"),
};

export const scanApi = {
  interfaces: ()      => api.get("/api/scan/interfaces"),
  start:      (iface) => api.post("/api/scan/start", { iface }),
  stop:       ()      => api.post("/api/scan/stop"),
  status:     ()      => api.get("/api/scan/status"),
  detections: ()      => api.get("/api/scan/detections"),
  flush:      ()      => api.post("/api/scan/flush"),
};

export default api;
