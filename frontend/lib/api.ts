import axios from 'axios'
import Cookies from 'js-cookie'

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000',
})

export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
    if (axios.isAxiosError(err)) {
        const data = err.response?.data as { error?: string } | undefined
        return data?.error ?? fallback
    }
    return fallback
}

api.interceptors.request.use((config) => {
    const token = Cookies.get('token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
})

api.interceptors.response.use(
    (r) => r,
    (err) => {
        // A 401 from the login endpoint itself just means "invalid credentials" —
        // let the login page show that inline instead of force-reloading /login.
        const isLoginRequest = err.config?.url === '/api/auth/login'
        if (err.response?.status === 401 && !isLoginRequest) {
            Cookies.remove('token')
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

export const scanApi = {
    interfaces: () => api.get('/api/scan/interfaces'),
    start: (iface?: string) => api.post('/api/scan/start', { iface }),
    stop: () => api.post('/api/scan/stop'),
    status: () => api.get('/api/scan/status'),
    detections: () => api.get('/api/scan/detections'),
    flush: () => api.post('/api/scan/flush'),
}

export default api
