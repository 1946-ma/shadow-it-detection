'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { clearAuth } from '@/lib/auth'
import Cookies from 'js-cookie'
import {
    LayoutDashboard, AlertCircle, Monitor, Package,
    FileText, Settings, UserCircle, LogOut, BarChart3, Shield, Wifi
} from 'lucide-react'

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
    { href: '/dashboard/profile',  label: 'Profile',  icon: UserCircle },
]

function NavLink({ href, label, icon: Icon, active, onClick, collapsed }: {
    href: string; label: string; icon: React.ComponentType<{ className?: string }>
    active: boolean; onClick?: () => void; collapsed?: boolean
}) {
    return (
        <Link href={href} className="block" onClick={onClick} title={collapsed ? label : undefined}>
            <motion.div
                whileHover={{ x: collapsed ? 0 : 4 }}
                className={`flex items-center gap-3 rounded-xl text-sm transition-all cursor-pointer
                    ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}
                    ${active
                        ? 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-500/25'
                        : 'text-slate-700 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent'
                    }`}
            >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
                {!collapsed && active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />}
            </motion.div>
        </Link>
    )
}

interface SidebarProps {
    mobileOpen: boolean
    onClose: () => void
}

function SidebarContent({ collapsed, onClose }: { collapsed: boolean; onClose?: () => void }) {
    const [mounted, setMounted] = useState(false)
    const [role, setRole]       = useState<string | undefined>(undefined)
    const pathname = usePathname()
    const router   = useRouter()

    useEffect(() => {
        setRole(Cookies.get('role'))
        setMounted(true)
    }, [])

    const logout = () => { clearAuth(); router.push('/login') }

    return (
        <aside className={`h-full glass border-r border-slate-200 dark:border-white/8 flex flex-col z-40 transition-all duration-300 ${collapsed ? 'w-16 p-2' : 'w-64 p-5'}`}>
            {/* Brand */}
            <div className={`flex items-center mb-8 ${collapsed ? 'justify-center px-1' : 'gap-2.5 px-1'}`}>
                <div className="w-8 h-8 flex-shrink-0 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-blue-400" />
                </div>
                {!collapsed && (
                    <div>
                        <p className="text-base font-bold text-slate-900 dark:text-white tracking-tight">Sentinel</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-600 uppercase tracking-widest">Detection</p>
                    </div>
                )}
            </div>

            {/* Main nav */}
            <nav className="flex-1 space-y-1">
                {mounted && navItems.map(item => {
                    if (item.adminOnly && role !== 'admin') return null
                    return (
                        <NavLink
                            key={item.href}
                            href={item.href}
                            label={item.label}
                            icon={item.icon}
                            active={pathname === item.href}
                            onClick={onClose}
                            collapsed={collapsed}
                        />
                    )
                })}
            </nav>

            {/* Settings / Profile */}
            {mounted && (
                <div className="space-y-1 mb-3">
                    {bottomItems.map(item => (
                        <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon}
                            active={pathname === item.href} onClick={onClose} collapsed={collapsed} />
                    ))}
                </div>
            )}

            {/* Footer */}
            <div className={`border-t border-slate-200 dark:border-white/8 pt-4 space-y-3 ${collapsed ? 'flex flex-col items-center' : ''}`}>
                {mounted && (
                    <>
                        {!collapsed && (
                            <div className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/3 flex items-center justify-between">
                                <span className="text-xs text-slate-600 dark:text-slate-500">Role</span>
                                <span className="text-xs font-medium text-blue-600 dark:text-blue-400 capitalize">{role}</span>
                            </div>
                        )}
                        <button
                            onClick={logout}
                            title={collapsed ? 'Sign out' : undefined}
                            className={`text-xs text-slate-600 dark:text-slate-600 hover:text-red-600 dark:hover:text-red-400 transition-colors flex items-center gap-2
                                ${collapsed ? 'p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5' : 'w-full text-left px-3 py-2'}`}
                        >
                            <LogOut className="w-4 h-4 flex-shrink-0" />
                            {!collapsed && 'Sign out'}
                        </button>
                    </>
                )}
            </div>
        </aside>
    )
}

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
    return (
        <>
            {/* Tablet (md): icon-only fixed sidebar */}
            <div className="hidden md:block lg:hidden fixed left-0 top-0 bottom-0 w-16 z-40">
                <SidebarContent collapsed={true} />
            </div>

            {/* Desktop (lg+): full sidebar */}
            <div className="hidden lg:block fixed left-0 top-0 bottom-0 w-64 z-40">
                <SidebarContent collapsed={false} />
            </div>

            {/* Mobile: slide-in drawer + backdrop */}
            <AnimatePresence>
                {mobileOpen && (
                    <>
                        <motion.div
                            key="backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="fixed inset-0 bg-black/60 z-40 md:hidden"
                            onClick={onClose}
                        />
                        <motion.div
                            key="drawer"
                            initial={{ x: -280 }}
                            animate={{ x: 0 }}
                            exit={{ x: -280 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            className="fixed left-0 top-0 bottom-0 z-50 md:hidden"
                        >
                            <SidebarContent collapsed={false} onClose={onClose} />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    )
}
