import Cookies from 'js-cookie'
import type { User } from './types'

// The JWT lives in an HttpOnly cookie set by the backend — it is NOT
// readable from JavaScript (XSS-safe) and is sent automatically on every
// request (axios withCredentials). These helpers only manage the
// non-sensitive role/username used for client-side UI gating; the backend
// re-verifies the real token on every protected route.

export const getRole = () => Cookies.get('role')
export const getUsername = () => Cookies.get('username')
export const setRole = (role: string) => Cookies.set('role', role, { expires: 1, sameSite: 'Lax' })
export const setUsername = (username: string) => Cookies.set('username', username, { expires: 1, sameSite: 'Lax' })

export const clearAuth = () => {
    Cookies.remove('role')
    Cookies.remove('username')
    // the token cookie is HttpOnly — cleared by POST /api/auth/logout
}

// Stores the non-sensitive fields from POST /api/auth/login: { token, user }.
// The token itself is ignored here — the backend already set it as an
// HttpOnly cookie on the login response.
export const setAuthFromLogin = (_token: string, user: User) => {
    setRole(user.role)
    setUsername(user.username)
}

// Presence of the role cookie is the client-side "logged in" signal. This is
// only for routing/UI; the HttpOnly token is what actually authorizes calls.
export const isAuthenticated = () => !!Cookies.get('role')
export const isAdmin = () => Cookies.get('role') === 'admin'
