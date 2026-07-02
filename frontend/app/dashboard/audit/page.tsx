'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import GlassCard from '@/components/ui/GlassCard'
import { auditApi } from '@/lib/api'
import { isAdmin } from '@/lib/auth'
import {
    LogIn, LogOut, ShieldAlert, Play, Wifi, WifiOff, FileText,
    Lock, MoreHorizontal, X, ShieldCheck, ShieldX, Loader2, ChevronLeft, ChevronRight,
} from 'lucide-react'
import type { AuditLog } from '@/lib/types'

const ACTIONS = ['all', 'LOGIN', 'LOGOUT', 'RESOLVE_DETECTION', 'RUN_DETECTION', 'SCAN_START', 'SCAN_STOP', 'REPORT_GENERATED']

const getActionIcon = (action: string) => {
    const icons: Record<string, React.ComponentType<{ className?: string }>> = {
        LOGIN: LogIn, LOGOUT: LogOut, RESOLVE_DETECTION: ShieldAlert, RUN_DETECTION: Play,
        SCAN_START: Wifi, SCAN_STOP: WifiOff, REPORT_GENERATED: FileText,
    }
    return icons[action] || MoreHorizontal
}

const getActionColor = (action: string) => {
    const map: Record<string, string> = {
        LOGIN: 'badge-login', LOGOUT: 'badge-logout', RESOLVE_DETECTION: 'badge-update',
        RUN_DETECTION: 'badge-detection', SCAN_START: 'badge-detection', SCAN_STOP: 'badge-detection',
        REPORT_GENERATED: 'badge-view',
    }
    return map[action] || 'badge-login'
}

const formatTimestamp = (iso: string) => {
    const date = new Date(iso)
    return {
        date: date.toLocaleDateString('en-GB'),
        time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
        full: date.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'long' }),
    }
}

const PAGE_SIZE = 25

interface VerifyResult {
    status: 'ok' | 'compromised'
    hashed_entries: number
    legacy_entries: number
    total_entries?: number
    broken_ids?: number[]
}

export default function AuditPage() {
    const router = useRouter()
    useEffect(() => { if (!isAdmin()) router.push('/dashboard') }, [router])

    const [logs, setLogs] = useState<AuditLog[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(true)
    const [filterAction, setFilterAction] = useState('all')
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
    const [verifying, setVerifying] = useState(false)
    const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)

    useEffect(() => {
        setLoading(true)
        auditApi.list({ page, per_page: PAGE_SIZE })
            .then((res) => { setLogs(res.data.logs); setTotal(res.data.total) })
            .catch((err) => console.error(err))
            .finally(() => setLoading(false))
    }, [page])

    const handleVerify = async () => {
        setVerifying(true)
        try {
            const res = await auditApi.verify()
            setVerifyResult(res.data)
        } catch (err) {
            console.error(err)
        } finally {
            setVerifying(false)
        }
    }

    const filteredLogs = filterAction === 'all' ? logs : logs.filter((l) => l.action === filterAction)
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const uniqueUsers = new Set(logs.map((l) => l.username).filter(Boolean)).size

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                        <Lock className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                        Audit Trail
                    </h1>
                    <p className="text-sm text-slate-700 dark:text-slate-400">
                        Read-only, hash-chained record of administrative actions and system events
                    </p>
                </div>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleVerify} disabled={verifying}
                    className="px-4 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-sm font-medium hover:bg-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-50">
                    {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    Verify Integrity
                </motion.button>
            </div>

            {verifyResult && (
                <div className={`integrity-badge ${verifyResult.status === 'ok' ? 'integrity-badge--ok' : 'integrity-badge--fail'}`}>
                    {verifyResult.status === 'ok' ? <ShieldCheck className="integrity-icon w-6 h-6" /> : <ShieldX className="integrity-icon w-6 h-6" />}
                    <div>
                        <div className="integrity-title">{verifyResult.status === 'ok' ? 'Chain Intact' : 'Chain Compromised'}</div>
                        <div className="integrity-sub">
                            {verifyResult.hashed_entries} hash-chained entries
                            {verifyResult.legacy_entries > 0 && `, ${verifyResult.legacy_entries} legacy (pre-hash) entries`}
                            {verifyResult.status === 'compromised' && ` — broken at IDs: ${verifyResult.broken_ids?.join(', ')}`}
                        </div>
                    </div>
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <GlassCard className="p-4">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-500 mb-3">Total events</p>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white">{total.toLocaleString()}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-500 mt-2">All time</p>
                </GlassCard>
                <GlassCard className="p-4">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-500 mb-3">This page</p>
                    <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{logs.length}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-500 mt-2">Page {page} of {totalPages}</p>
                </GlassCard>
                <GlassCard className="p-4">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-500 mb-3">Distinct users (this page)</p>
                    <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{uniqueUsers}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-500 mt-2">Active accounts</p>
                </GlassCard>
            </div>

            {/* Filters */}
            <GlassCard className="p-6">
                <div className="flex flex-wrap gap-2">
                    {ACTIONS.map((action) => (
                        <motion.button key={action} whileHover={{ scale: 1.02 }} onClick={() => setFilterAction(action)}
                            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${filterAction === action
                                ? 'bg-blue-600 text-white border border-blue-600'
                                : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-400 border border-slate-300 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10'}`}>
                            {action === 'all' ? 'All actions' : action.replace(/_/g, ' ')}
                        </motion.button>
                    ))}
                </div>
            </GlassCard>

            {/* Table */}
            <GlassCard className="overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-300 dark:border-white/10 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                        <Lock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <span className="font-semibold text-slate-900 dark:text-white">Event log</span>
                        <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-400">Read-only</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                            className="p-1.5 rounded border border-slate-300 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-40 transition-all"><ChevronLeft className="w-3.5 h-3.5" /></button>
                        <span>Page {page} of {totalPages}</span>
                        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                            className="p-1.5 rounded border border-slate-300 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-40 transition-all"><ChevronRight className="w-3.5 h-3.5" /></button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-100 dark:bg-white/8 border-b border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                <th className="text-left px-4 py-3">Timestamp</th>
                                <th className="text-left px-3 py-3">Action</th>
                                <th className="text-left px-3 py-3">Target</th>
                                <th className="text-left px-3 py-3">User</th>
                                <th className="text-left px-3 py-3">Source IP</th>
                                <th className="px-3 py-3" />
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} className="px-6 py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-400" /></td></tr>
                            ) : filteredLogs.length === 0 ? (
                                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-600 dark:text-slate-400 text-sm">No audit logs found</td></tr>
                            ) : filteredLogs.map((log) => {
                                const ActionIcon = getActionIcon(log.action)
                                const ts = formatTimestamp(log.timestamp)
                                return (
                                    <motion.tr key={log.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                        className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/4 transition-colors">
                                        <td className="px-4 py-3 align-middle">
                                            <div className="text-xs font-medium text-slate-800 dark:text-slate-200">{ts.date}</div>
                                            <div className="text-[11px] text-slate-500 dark:text-slate-500">{ts.time}</div>
                                        </td>
                                        <td className="px-3 py-3 align-middle">
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${getActionColor(log.action)}`}>
                                                <ActionIcon className="w-3 h-3 flex-shrink-0" />
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 align-middle max-w-[220px] truncate text-sm text-slate-800 dark:text-white">{log.target || '—'}</td>
                                        <td className="px-3 py-3 align-middle text-xs font-medium text-slate-800 dark:text-white">{log.username || 'System'}</td>
                                        <td className="px-3 py-3 align-middle"><span className="text-xs font-mono text-blue-600 dark:text-blue-400">{log.ip_address || '—'}</span></td>
                                        <td className="px-3 py-3 align-middle text-right">
                                            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} onClick={() => setSelectedLog(log)}
                                                className="p-1.5 rounded border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/8 transition-all">
                                                <FileText className="w-3.5 h-3.5" />
                                            </motion.button>
                                        </td>
                                    </motion.tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </GlassCard>

            {/* Detail panel */}
            <AnimatePresence>
                {selectedLog && (
                    <>
                        <motion.div key="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => setSelectedLog(null)} />
                        <motion.div key="panel" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                            className="fixed top-0 right-0 h-full w-full max-w-md z-50 bg-white dark:bg-slate-900/98 border-l border-slate-200 dark:border-white/10 backdrop-blur-xl overflow-y-auto">
                            <div className="p-6">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Event Detail</h2>
                                    <button onClick={() => setSelectedLog(null)}
                                        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white transition-all">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="mb-6">
                                    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${getActionColor(selectedLog.action)}`}>
                                        {(() => { const I = getActionIcon(selectedLog.action); return <I className="w-4 h-4" /> })()}
                                        {selectedLog.action}
                                    </span>
                                </div>

                                <div className="space-y-3">
                                    {[
                                        { label: 'Event ID', value: `#${selectedLog.id}` },
                                        { label: 'Timestamp', value: formatTimestamp(selectedLog.timestamp).full },
                                        { label: 'Target', value: selectedLog.target || '—' },
                                        { label: 'Performed by', value: selectedLog.username || 'System' },
                                        { label: 'Source IP', value: selectedLog.ip_address || '—', mono: true },
                                    ].map(({ label, value, mono }) => (
                                        <div key={label} className="flex items-start justify-between py-2.5 border-b border-slate-100 dark:border-white/5">
                                            <span className="text-xs text-slate-500 dark:text-slate-400 min-w-[120px]">{label}</span>
                                            <span className={`text-xs text-slate-900 dark:text-slate-200 text-right ml-4 ${mono ? 'font-mono' : ''}`}>{value}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-6 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-center gap-2">
                                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                                    <p className="text-xs text-emerald-700 dark:text-emerald-300">This record is tamper-evident and stored in the immutable, hash-chained audit log.</p>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    )
}
