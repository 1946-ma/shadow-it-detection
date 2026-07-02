'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Cookies from 'js-cookie'
import { clearAuth } from '@/lib/auth'
import { authApi, statsApi } from '@/lib/api'
import {
    Search, Bell, Moon, Sun, UserCircle, Settings, LogOut,
    LayoutDashboard, AlertCircle, Monitor, Package, FileText, BarChart3, Wifi,
    X, Shield, Menu,
} from 'lucide-react'

const SEARCH_INDEX = [
    { label: 'Overview',     description: 'Dashboard summary & stats',       href: '/dashboard',              icon: LayoutDashboard, keywords: ['overview','dashboard','home','summary','stats'] },
    { label: 'Alerts',       description: 'Security alerts & detections',     href: '/dashboard/alerts',       icon: AlertCircle,     keywords: ['alerts','detections','anomaly','flagged'] },
    { label: 'Devices',      description: 'Device inventory & risk scores',   href: '/dashboard/devices',      icon: Monitor,         keywords: ['devices','device','laptop','desktop','server'] },
    { label: 'Applications', description: 'Application monitoring & control', href: '/dashboard/applications', icon: Package,         keywords: ['applications','apps','software'] },
    { label: 'Reports',      description: 'Model performance & test scenarios', href: '/dashboard/reports',    icon: BarChart3,       keywords: ['reports','metrics','performance','accuracy','scenarios'] },
    { label: 'Live Scan',    description: 'Real-time packet capture',         href: '/dashboard/live-scan',    icon: Wifi,            keywords: ['live','scan','capture','packet','scapy'] },
    { label: 'Audit Trail',  description: 'Compliance & activity logs',       href: '/dashboard/audit',        icon: FileText,        keywords: ['audit','trail','logs','compliance','history','activity'] },
    { label: 'Settings',     description: 'Appearance settings',              href: '/dashboard/settings',     icon: Settings,        keywords: ['settings','config','appearance','dark mode'] },
    { label: 'Profile',      description: 'Your account profile',             href: '/dashboard/profile',      icon: UserCircle,      keywords: ['profile','account','user','me'] },
]

function getResults(query: string) {
    const q = query.toLowerCase().trim()
    if (!q) return []
    return SEARCH_INDEX.filter(item =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.keywords.some(k => k.includes(q))
    )
}

export default function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
    const [showLogout,       setShowLogout]       = useState(false)
    const [showNotif,        setShowNotif]        = useState(false)
    const [mounted,          setMounted]          = useState(false)
    const [role,             setRole]             = useState<string | undefined>(undefined)
    const [username,         setUsername]         = useState('User')
    const [isDarkMode,       setIsDarkMode]       = useState(true)
    const [searchQuery,      setSearchQuery]      = useState('')
    const [searchOpen,       setSearchOpen]       = useState(false)
    const [activeIndex,      setActiveIndex]      = useState(0)
    const [highUnresolved,   setHighUnresolved]   = useState(0)

    const searchRef  = useRef<HTMLDivElement>(null)
    const inputRef   = useRef<HTMLInputElement>(null)
    const notifTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const router = useRouter()

    useEffect(() => {
        setRole(Cookies.get('role'))
        setUsername(Cookies.get('username') || 'User')
        setMounted(true)
        const saved = localStorage.getItem('darkMode')
        if (saved !== null) setIsDarkMode(JSON.parse(saved))
        else setIsDarkMode(document.documentElement.classList.contains('dark'))
    }, [])

    useEffect(() => {
        const fetchAlerts = () =>
            statsApi.alerts().then((r) => setHighUnresolved(r.data.high_unresolved)).catch(() => {})
        fetchAlerts()
        const t = setInterval(fetchAlerts, 60_000)
        return () => clearInterval(t)
    }, [])

    // Close search on outside click
    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false)
        }
        document.addEventListener('mousedown', h)
        return () => document.removeEventListener('mousedown', h)
    }, [])

    const results = getResults(searchQuery)

    const navigate = useCallback((href: string) => {
        setSearchQuery(''); setSearchOpen(false); router.push(href)
    }, [router])

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (!searchOpen || results.length === 0) return
        if (e.key === 'ArrowDown')  { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1)) }
        else if (e.key === 'ArrowUp')  { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)) }
        else if (e.key === 'Enter')    { e.preventDefault(); navigate(results[activeIndex]?.href ?? results[0].href) }
        else if (e.key === 'Escape')   { setSearchOpen(false); setSearchQuery('') }
    }

    useEffect(() => { setActiveIndex(0) }, [searchQuery])

    const logout = async () => {
        try { await authApi.logout() } catch { /* logout locally even if the request fails */ }
        clearAuth()
        router.push('/login')
    }

    const toggleDark = () => {
        const n = !isDarkMode
        setIsDarkMode(n)
        localStorage.setItem('darkMode', JSON.stringify(n))
        document.documentElement.classList.toggle('dark', n)
    }

    const openNotif = () => {
        clearNotifTimer()
        setShowNotif(true)
        setShowLogout(false)
    }

    const closeNotif = () => {
        clearNotifTimer()
        setShowNotif(false)
    }

    const clearNotifTimer = () => {
        if (notifTimer.current) { clearTimeout(notifTimer.current); notifTimer.current = null }
    }

    const startNotifTimer = () => {
        clearNotifTimer()
        notifTimer.current = setTimeout(() => setShowNotif(false), 5000)
    }

    useEffect(() => () => clearNotifTimer(), [])

    // Use CSS variables so the dropdown always matches the theme
    // regardless of whether the Tailwind `dark` class is set
    const dropdownStyle: React.CSSProperties = {
        background: 'var(--glass-bg)',
        borderColor: 'var(--glass-border)',
    }
    const dropdownBase =
        'z-50 rounded-xl shadow-2xl border backdrop-blur-xl overflow-hidden'
    const dropdownPos =
        'fixed left-2 right-2 top-[3.75rem] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80'

    return (
        <motion.header
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass border-b border-slate-200 dark:border-white/8 px-4 sm:px-6 py-3 sticky top-0 z-30"
        >
            <div className="flex items-center justify-between gap-3">

                {/* ── LEFT: Brand ── */}
                <div className="flex items-center gap-2.5 flex-shrink-0">
                    <button
                        onClick={onMenuClick}
                        className="md:hidden p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                        aria-label="Open menu"
                    >
                        <Menu className="w-5 h-5 text-slate-700 dark:text-white" />
                    </button>
                    <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/35 flex items-center justify-center flex-shrink-0">
                        <Shield className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                        <p className="text-base font-bold text-slate-900 dark:text-white tracking-tight leading-tight">Sentinel</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-500 uppercase tracking-widest hidden sm:block">Detection</p>
                    </div>
                </div>

                {/* ── RIGHT: Actions ── */}
                <div className="flex items-center gap-1.5 sm:gap-2">

                    {/* Search */}
                    <div ref={searchRef} className="hidden md:block relative">
                        <div className="flex items-center px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 w-44 lg:w-64 xl:w-80">
                            <Search className="w-3.5 h-3.5 text-slate-400 mr-2 flex-shrink-0" />
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="Search…"
                                value={searchQuery}
                                onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true) }}
                                onFocus={() => setSearchOpen(true)}
                                onKeyDown={handleSearchKeyDown}
                                className="bg-transparent text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/35 flex-1 outline-none text-sm"
                            />
                            {searchQuery && (
                                <button onClick={() => { setSearchQuery(''); setSearchOpen(false); inputRef.current?.focus() }}>
                                    <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors" />
                                </button>
                            )}
                        </div>

                        <AnimatePresence>
                            {searchOpen && results.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                                    transition={{ duration: 0.12 }}
                                    className="search-results-dropdown absolute top-full left-0 right-0 mt-1.5 rounded-xl overflow-hidden z-50"
                                >
                                    <p className="search-section-label px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider">Pages</p>
                                    {results.map((item, idx) => {
                                        const Icon = item.icon
                                        const isActive = idx === activeIndex
                                        return (
                                            <button
                                                key={item.href}
                                                onMouseEnter={() => setActiveIndex(idx)}
                                                onClick={() => navigate(item.href)}
                                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? 'search-result-active' : ''}`}
                                            >
                                                <div className="search-result-icon w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0">
                                                    <Icon className="w-3.5 h-3.5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="search-result-label text-sm font-medium">{item.label}</p>
                                                    <p className="search-result-desc text-xs truncate">{item.description}</p>
                                                </div>
                                                {isActive && <span className="search-enter-hint ml-auto text-xs flex-shrink-0">↵</span>}
                                            </button>
                                        )
                                    })}
                                    <p className="search-results-footer px-4 py-2 text-xs border-t">↑↓ navigate · ↵ open · Esc close</p>
                                </motion.div>
                            )}
                            {searchOpen && searchQuery.length > 0 && results.length === 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                    className="search-no-results absolute top-full left-0 right-0 mt-1.5 rounded-xl p-4 z-50"
                                >
                                    <p className="text-sm text-center">No results for &ldquo;{searchQuery}&rdquo;</p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* ── Notifications ── */}
                    <div className="relative">
                        <motion.button
                            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}
                            onClick={showNotif ? closeNotif : openNotif}
                            className="relative p-2 rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-white/10"
                            title="Unresolved high-risk alerts"
                        >
                            <Bell className="w-5 h-5 text-slate-400 dark:text-white" />
                            {highUnresolved > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white pointer-events-none">
                                    {highUnresolved > 99 ? '99+' : highUnresolved}
                                </span>
                            )}
                        </motion.button>

                        <AnimatePresence>
                            {showNotif && (
                                <motion.div
                                    key="notif-dropdown"
                                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                                    transition={{ duration: 0.15 }}
                                    className={`${dropdownBase} ${dropdownPos}`}
                                    style={dropdownStyle}
                                    onMouseEnter={clearNotifTimer}
                                    onMouseLeave={startNotifTimer}
                                >
                                    {/* Header */}
                                    <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2" style={{ background: 'var(--bg-surface)' }}>
                                        <Bell className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                                        <span className="text-sm font-semibold text-white">Unresolved High-Risk Alerts</span>
                                    </div>

                                    <button
                                        onClick={() => { closeNotif(); router.push('/dashboard/alerts?risk=high') }}
                                        className="w-full text-left px-4 py-4 transition-colors hover:bg-white/5"
                                    >
                                        {highUnresolved > 0 ? (
                                            <div className="flex items-center gap-3">
                                                <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                                                <p className="text-sm text-white">
                                                    <span className="font-bold text-red-400">{highUnresolved}</span> unresolved high-risk detection{highUnresolved === 1 ? '' : 's'} — view alerts →
                                                </p>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-slate-400">No unresolved high-risk alerts</p>
                                        )}
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Dark Mode Toggle */}
                    <motion.button
                        whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}
                        onClick={toggleDark}
                        className="p-2 rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-white/8"
                        title={isDarkMode ? 'Light mode' : 'Dark mode'}
                    >
                        {isDarkMode
                            ? <Moon className="w-5 h-5 text-blue-400" />
                            : <Sun className="w-5 h-5 text-yellow-500" />
                        }
                    </motion.button>

                    {/* ── User Menu ── */}
                    {mounted && (
                        <div className="relative">
                            <motion.button
                                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                                onClick={() => { setShowLogout(!showLogout); setShowNotif(false); clearNotifTimer() }}
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
                            >
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                                    {username.split(' ')[0]?.charAt(0).toUpperCase()}{username.split(' ')[1]?.charAt(0).toUpperCase() || ''}
                                </div>
                                <div className="text-left hidden sm:block">
                                    <p className="text-xs font-semibold text-slate-900 dark:text-white leading-tight">{username}</p>
                                    <p className="text-[10px] capitalize text-slate-500 dark:text-slate-500 leading-tight">{role}</p>
                                </div>
                            </motion.button>

                            <AnimatePresence>
                                {showLogout && (
                                    <motion.div
                                        key="user-dropdown"
                                        initial={{ opacity: 0, y: -8, scale: 0.96 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -8, scale: 0.96 }}
                                        transition={{ duration: 0.15 }}
                                        className={`${dropdownBase} fixed left-2 right-2 top-[3.75rem] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-52`}
                                        style={dropdownStyle}
                                    >
                                        <div className="p-3 border-b border-white/10">
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Logged in as</p>
                                            <p className="text-sm font-semibold text-white">{username}</p>
                                            <p className="text-xs capitalize text-blue-400">{role}</p>
                                        </div>
                                        <button
                                            onClick={() => { setShowLogout(false); router.push('/dashboard/profile') }}
                                            className="w-full px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-white/8 flex items-center gap-2.5 transition-colors"
                                        >
                                            <UserCircle className="w-4 h-4 text-slate-400" /> Profile
                                        </button>
                                        <button
                                            onClick={() => { setShowLogout(false); router.push('/dashboard/settings') }}
                                            className="w-full px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-white/8 flex items-center gap-2.5 transition-colors"
                                        >
                                            <Settings className="w-4 h-4 text-slate-400" /> Settings
                                        </button>
                                        <div className="border-t border-white/10 p-1.5">
                                            <button
                                                onClick={logout}
                                                className="w-full px-4 py-2 text-left text-sm rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center gap-2.5 transition-colors"
                                            >
                                                <LogOut className="w-4 h-4" /> Sign Out
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </div>
        </motion.header>
    )
}
