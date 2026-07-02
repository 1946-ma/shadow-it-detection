import Cookies from 'js-cookie'
import type { User } from './types'

export const getToken = () => Cookies.get('token')
export const getRole = () => Cookies.get('role')
export const getUsername = () => Cookies.get('username')
export const setToken = (token: string) => Cookies.set('token', token, { expires: 1 })
export const setRole = (role: string) => Cookies.set('role', role, { expires: 1 })
export const setUsername = (username: string) => Cookies.set('username', username, { expires: 1 })

export const clearAuth = () => {
    Cookies.remove('token')
    Cookies.remove('role')
    Cookies.remove('username')
}

// Stores the cookies from a real POST /api/auth/login response: { token, user }
export const setAuthFromLogin = (token: string, user: User) => {
    setToken(token)
    setRole(user.role)
    setUsername(user.username)
}

export const isAuthenticated = () => !!Cookies.get('token')
export const isAdmin = () => Cookies.get('role') === 'admin'
