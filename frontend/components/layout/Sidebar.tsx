'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { clearAuth } from '@/lib/auth'
import Cookies from 'js-cookie'
import {
    LayoutDashboard, AlertCircle, Monitor, Package,
    FileText, Settings, LogOut, BarChart3, Shield, Wifi,
} from 'lucide-react'

const WK = { indigo: '#2a7477', ink: '#14201f', muted: '#6b7089', line: '#e6e9e8', hover: '#f2f3fb' }

const navItems = [
    { href: '/dashboard',              label: 'Overview',     icon: LayoutDashboard },
    { href: '/dashboard/alerts',       label: 'Alerts',       icon: AlertCircle },
    { href: '/dashboard/devices',      label: 'Devices',      icon: Monitor },
    { href: '/dashboard/applications', label: 'Applications', icon: Package },
    { href: '/dashboard/reports',      label: 'Reports',      icon: BarChart3 },
    { href: '/dashboard/live-scan',    label: 'Live Scan',    icon: Wifi, adminOnly: true },
    { href: '/dashboard/audit',        label: 'Audit Trail',  icon: FileText, adminOnly: true },
]

const bottomItems = [
    { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

function RailLink({ href, label, icon: Icon, active, onClick, expanded }: {
    href: string; label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
    active: boolean; onClick?: () => void; expanded?: boolean
}) {
    return (
        <Link href={href} onClick={onClick} title={expanded ? undefined : label}
            className={`flex items-center rounded-xl transition-all ${expanded ? 'gap-3 px-3 py-2.5 w-full' : 'justify-center w-11 h-11 mx-auto'}`}
            style={{ background: active ? WK.indigo : 'transparent', color: active ? '#fff' : WK.muted }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = WK.hover }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
        >
            <Icon className="w-5 h-5 flex-shrink-0" style={{ color: active ? '#fff' : WK.muted }} />
            {expanded && <span className="text-sm font-medium">{label}</span>}
        </Link>
    )
}

function RailContent({ expanded, onClose }: { expanded: boolean; onClose?: () => void }) {
    const [mounted, setMounted] = useState(false)
    const [role, setRole]       = useState<string | undefined>(undefined)
    const [username, setUsername] = useState('User')
    const pathname = usePathname()
    const router   = useRouter()

    useEffect(() => {
        setRole(Cookies.get('role'))
        setUsername(Cookies.get('username') || 'User')
        setMounted(true)
    }, [])

    const logout = () => { clearAuth(); router.push('/login') }
    const initials = username.split(' ').map(s => s.charAt(0).toUpperCase()).slice(0, 2).join('')

    return (
        <div className={`h-full flex flex-col ${expanded ? 'w-64 px-3 py-5' : 'w-[76px] py-5'}`}
            style={{ background: '#ffffff', borderRight: `1px solid ${WK.line}` }}>
            {/* Brand */}
            <div className={`flex items-center mb-8 ${expanded ? 'gap-2.5 px-2' : 'justify-center'}`}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: WK.indigo }}>
                    <Shield className="w-5 h-5 text-white" />
                </div>
                {expanded && <span className="text-base font-bold tracking-tight" style={{ color: WK.ink }}>Sentinel</span>}
            </div>

            {/* Main nav */}
            <nav className="flex-1 flex flex-col gap-1.5">
                {mounted && navItems.map(item => {
                    if (item.adminOnly && role !== 'admin') return null
                    return (
                        <RailLink key={item.href} href={item.href} label={item.label} icon={item.icon}
                            active={pathname === item.href} onClick={onClose} expanded={expanded} />
                    )
                })}
            </nav>

            {/* Bottom */}
            {mounted && (
                <div className="flex flex-col gap-1.5 pt-4 mt-4" style={{ borderTop: `1px solid ${WK.line}` }}>
                    {bottomItems.map(item => (
                        <RailLink key={item.href} href={item.href} label={item.label} icon={item.icon}
                            active={pathname === item.href} onClick={onClose} expanded={expanded} />
                    ))}
                    <button onClick={logout} title={expanded ? undefined : 'Sign out'}
                        className={`flex items-center rounded-xl transition-colors ${expanded ? 'gap-3 px-3 py-2.5' : 'justify-center w-11 h-11 mx-auto'}`}
                        style={{ color: WK.muted }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#1c2624' }}
                        onMouseLeave={e => { e.currentTarget.style.color = WK.muted }}>
                        <LogOut className="w-5 h-5 flex-shrink-0" />
                        {expanded && <span className="text-sm font-medium">Sign out</span>}
                    </button>
                    {/* Avatar */}
                    <Link href="/dashboard/profile" onClick={onClose} title={expanded ? undefined : username}
                        className={`flex items-center rounded-xl mt-1 ${expanded ? 'gap-3 px-2 py-2' : 'justify-center'}`}>
                        <span className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                            style={{ background: `linear-gradient(135deg, ${WK.indigo}, #4a9ea1)` }}>{initials}</span>
                        {expanded && (
                            <span className="min-w-0">
                                <span className="block text-sm font-semibold leading-tight truncate" style={{ color: WK.ink }}>{username}</span>
                                <span className="block text-[11px] capitalize" style={{ color: WK.muted }}>{role}</span>
                            </span>
                        )}
                    </Link>
                </div>
            )}
        </div>
    )
}

interface SidebarProps { mobileOpen: boolean; onClose: () => void }

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
    return (
        <>
            {/* Tablet (md): icon rail */}
            <div className="hidden md:block lg:hidden fixed left-0 top-0 bottom-0 z-40">
                <RailContent expanded={false} />
            </div>
            {/* Desktop (lg+): labeled sidebar */}
            <div className="hidden lg:block fixed left-0 top-0 bottom-0 z-40">
                <RailContent expanded={true} />
            </div>
            {/* Mobile: slide-in drawer */}
            <AnimatePresence>
                {mobileOpen && (
                    <>
                        <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }} className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={onClose} />
                        <motion.div key="drawer" initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            className="fixed left-0 top-0 bottom-0 z-50 md:hidden">
                            <RailContent expanded={true} onClose={onClose} />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    )
}
