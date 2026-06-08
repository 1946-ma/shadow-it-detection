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
};

export const statsApi = {
  get: () => api.get("/api/stats"),
};

export const auditApi = {
  list: (params) => api.get("/api/audit-logs", { params }),
};

export default api;
