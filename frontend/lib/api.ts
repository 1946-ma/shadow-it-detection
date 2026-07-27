import axios from 'axios'
import Cookies from 'js-cookie'

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000',
    // Send the HttpOnly auth cookie on every request (and store it from the
    // login response). No Authorization header is needed anymore.
    withCredentials: true,
})

export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
    if (axios.isAxiosError(err)) {
        const data = err.response?.data as { error?: string } | undefined
        return data?.error ?? fallback
    }
    return fallback
}

api.interceptors.response.use(
    (r) => r,
    (err) => {
        // A 401 from the login endpoint itself just means "invalid credentials" —
        // let the login page show that inline instead of force-reloading /login.
        const isLoginRequest = err.config?.url === '/api/auth/login'
        if (err.response?.status === 401 && !isLoginRequest) {
            // token cookie is HttpOnly (cleared by the server); drop UI cookies
            Cookies.remove('role')
            Cookies.remove('username')
            if (typeof window !== 'undefined') {
                window.location.href = '/login'
            }
        }
        return Promise.reject(err)
    }
)

export const authApi = {
    login: (username: string, password: string) =>
        api.post('/api/auth/login', { username, password }),
    logout: () => api.post('/api/auth/logout'),
}

export const detectionsApi = {
    list: (params?: Record<string, unknown>) => api.get('/api/detections', { params }),
    get: (id: number | string) => api.get(`/api/detections/${id}`),
    resolve: (id: number | string) => api.patch(`/api/detections/${id}/resolve`),
    runDetection: () => api.post('/api/run-detection'),
    export: (params?: Record<string, unknown>) =>
        api.get('/api/detections/export', { params, responseType: 'blob' }),
}

export const statsApi = {
    get: () => api.get('/api/stats'),
    timeline: (days = 30) => api.get('/api/stats/timeline', { params: { days } }),
    alerts: () => api.get('/api/stats/alerts'),
    topOffenders: (limit = 10) => api.get('/api/stats/top-offenders', { params: { limit } }),
}

export const metricsApi = {
    get: () => api.get('/api/metrics'),
}

export const auditApi = {
    list: (params?: Record<string, unknown>) => api.get('/api/audit-logs', { params }),
    verify: () => api.get('/api/audit-logs/verify'),
}

export const reportApi = {
    generate: () => api.get('/api/report/generate', { responseType: 'blob' }),
}

export const assistantApi = {
    // LLM round-trips can take a while — allow a longer client timeout.
    // `history` = prior { role, content } turns for multi-turn memory.
    ask: (question: string, history?: { role: string; content: string }[]) =>
        api.post('/api/assistant/ask', { question, history }, { timeout: 60000 }),
}

export const scanApi = {
    interfaces: () => api.get('/api/scan/interfaces'),
    start: (iface?: string) => api.post('/api/scan/start', { iface }),
    stop: () => api.post('/api/scan/stop'),
    status: () => api.get('/api/scan/status'),
    detections: () => api.get('/api/scan/detections'),
    flush: () => api.post('/api/scan/flush'),
    // Active ARP + port scan of the local subnet — can take a while, so a
    // longer client timeout than the default.
    discover: (iface_ip: string, authorized: boolean) =>
        api.post('/api/scan/discover', { iface_ip, authorized }, { timeout: 180000 }),
}

export const wazuhApi = {
    // Passive connectivity check — no Syscollector pull, no DB writes.
    status: () => api.get('/api/wazuh/status'),
    // Pulls installed-software inventory from every connected Wazuh agent and
    // saves unsanctioned-catalog matches as detections (detection_source='wazuh').
    sync: () => api.post('/api/wazuh/sync', {}, { timeout: 30000 }),
}

export const radiusApi = {
    // Passive check — counts currently-open RADIUS sessions, no DB writes.
    status: () => api.get('/api/radius/status'),
    // Flags identities with 2+ open RADIUS sessions from different NAS IPs.
    sync: () => api.post('/api/radius/sync', {}, { timeout: 15000 }),
}

export const firewallApi = {
    // Generates a draft rule from a detection — never executes anything.
    generate: (detectionId: number) =>
        api.post('/api/firewall/rules/generate', { detection_id: detectionId }),
    list: (params?: Record<string, unknown>) => api.get('/api/firewall/rules', { params }),
    // Approving actually runs the command against the real target (SSH /
    // vmrun) — vmrun in particular can take up to ~45s, so a long timeout.
    review: (id: number, status: 'approved' | 'rejected') =>
        api.patch(`/api/firewall/rules/${id}`, { status }, { timeout: 60000 }),
}

export default api
