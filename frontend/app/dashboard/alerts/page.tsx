'use client'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import GlassCard from '@/components/ui/GlassCard'
import AnimatedCounter from '@/components/ui/AnimatedCounter'
import { StatusIcon } from '@/components/ui/StatusIcon'
import {
    TrendingUp, AlertCircle, CheckCircle, X, ChevronLeft, ChevronRight, Download, Loader2,
} from 'lucide-react'
import { detectionsApi, statsApi } from '@/lib/api'
import { isAdmin } from '@/lib/auth'
import type { Detection, DashboardSummary } from '@/lib/types'

const getRiskColor = (risk: string | null) => {
    switch (risk) {
        case 'high': return { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', status: 'high' as const }
        case 'medium': return { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', status: 'medium' as const }
        case 'low': return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', status: 'low' as const }
        default: return { bg: 'bg-slate-500/10', border: 'border-slate-500/20', text: 'text-slate-400', status: 'low' as const }
    }
}

function formatTimestamp(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const PAGE_SIZE = 20

function AlertsPageInner() {
    const searchParams = useSearchParams()
    const admin = isAdmin()

    const [detections, setDetections] = useState<Detection[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [typeFilter, setTypeFilter] = useState('')
    const [riskFilter, setRiskFilter] = useState(searchParams.get('risk') || '')
    const [loading, setLoading] = useState(true)
    const [selected, setSelected] = useState<Detection | null>(null)
    const [resolving, setResolving] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [summary, setSummary] = useState<DashboardSummary | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const params: Record<string, unknown> = { page, per_page: PAGE_SIZE }
            if (typeFilter) params.type = typeFilter
            if (riskFilter) params.risk = riskFilter
            const res = await detectionsApi.list(params)
            setDetections(res.data.detections || [])
            setTotal(res.data.total || 0)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }, [page, typeFilter, riskFilter])

    useEffect(() => { load() }, [load])
    useEffect(() => { statsApi.get().then((r) => setSummary(r.data)).catch(() => {}) }, [])
    useEffect(() => { setPage(1) }, [typeFilter, riskFilter])

    const markResolved = useCallback(async (id: number) => {
        setResolving(true)
        try {
            await detectionsApi.resolve(id)
            setDetections((prev) => prev.map((d) => (d.id === id ? { ...d, is_resolved: true } : d)))
            setSelected((prev) => (prev?.id === id ? { ...prev, is_resolved: true } : prev))
        } catch (err) {
            console.error(err)
        } finally {
            setResolving(false)
        }
    }, [])

    const handleExport = async () => {
        setExporting(true)
        try {
            const params: Record<string, unknown> = {}
            if (typeFilter) params.type = typeFilter
            if (riskFilter) params.risk = riskFilter
            const res = await detectionsApi.export(params)
            const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
            const a = document.createElement('a')
            a.href = url
            a.download = 'detections.csv'
            a.click()
            URL.revokeObjectURL(url)
        } catch (err) {
            console.error(err)
        } finally {
            setExporting(false)
        }
    }

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

    return (
        <div className="space-y-6">
            {/* Stats */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { label: 'Total Detections', value: summary.total_detections, icon: TrendingUp, color: 'blue' as const },
                        { label: 'Unresolved', value: summary.unresolved, icon: AlertCircle, color: 'red' as const },
                        { label: 'High Risk', value: summary.by_risk.high ?? 0, status: 'high' as const, color: null },
                        { label: 'Resolved', value: summary.resolved, icon: CheckCircle, color: 'emerald' as const },
                    ].map((stat) => (
                        <motion.div key={stat.label} whileHover={{ y: -4 }}>
                            <GlassCard className="p-4 h-full hover:bg-white/10 transition-all cursor-pointer">
                                <div className="text-2xl mb-2">
                                    {stat.status ? <StatusIcon status={stat.status} size="lg" /> : stat.icon && <stat.icon className="w-6 h-6" />}
                                </div>
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-500 mb-2">{stat.label}</p>
                                <AnimatedCounter value={stat.value} className={`text-2xl font-bold text-${stat.color || 'red'}-400`} />
                            </GlassCard>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Filters */}
            <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-400">Filter</h3>
                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleExport} disabled={exporting || total === 0}
                        className="text-xs px-4 py-2 rounded-lg bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-white/10 border border-white/10 transition-all font-medium flex items-center gap-2 disabled:opacity-50">
                        {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Export CSV
                    </motion.button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50">
                        <option value="">All Types</option>
                        <option value="software">Software</option>
                        <option value="hardware">Hardware</option>
                        <option value="mixed">Mixed</option>
                    </select>
                    <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50">
                        <option value="">All Risk Levels</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                    </select>
                </div>
            </GlassCard>

            {/* Table */}
            <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Alerts</h3>
                    <span className="text-xs text-slate-500">{total.toLocaleString()} result{total !== 1 ? 's' : ''}</span>
                </div>

                {loading ? (
                    <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-400" /></div>
                ) : detections.length === 0 ? (
                    <div className="text-center py-12"><p className="text-slate-600 dark:text-slate-500">No alerts found</p></div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="border-b border-slate-200 dark:border-white/10">
                                    <tr className="text-xs text-slate-900 dark:text-slate-500 font-medium">
                                        <th className="text-left py-3 px-4">Timestamp</th>
                                        <th className="text-left py-3 px-4">Source IP</th>
                                        <th className="text-left py-3 px-4">Destination</th>
                                        <th className="text-left py-3 px-4">Type</th>
                                        <th className="text-left py-3 px-4">Risk Level</th>
                                        <th className="text-left py-3 px-4">Score</th>
                                        <th className="text-left py-3 px-4">Status</th>
                                        {admin && <th className="text-left py-3 px-4">Action</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {detections.map((detection) => {
                                        const riskConfig = getRiskColor(detection.risk_level)
                                        return (
                                            <motion.tr key={detection.id} onClick={() => setSelected(detection)}
                                                whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                                                className="border-b border-slate-200 dark:border-white/5 cursor-pointer">
                                                <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">{formatTimestamp(detection.detected_at)}</td>
                                                <td className="py-3 px-4 text-xs font-mono text-slate-700 dark:text-slate-300">{detection.src_ip}</td>
                                                <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300 max-w-[180px] truncate">{detection.dst_domain || '—'}</td>
                                                <td className="py-3 px-4 text-xs"><span className="px-2 py-1 rounded bg-blue-500/20 text-blue-300">{detection.shadow_it_type || 'Unknown'}</span></td>
                                                <td className="py-3 px-4">
                                                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${riskConfig.bg} border ${riskConfig.border}`}>
                                                        <StatusIcon status={riskConfig.status} size="sm" /> {detection.risk_level?.toUpperCase()}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-xs text-amber-400 font-mono">{detection.anomaly_score != null ? detection.anomaly_score.toFixed(4) : '—'}</td>
                                                <td className="py-3 px-4">
                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${detection.is_resolved ? 'bg-slate-500/20 text-slate-300' : 'bg-blue-500/20 text-blue-300'}`}>
                                                        {detection.is_resolved ? 'RESOLVED' : 'OPEN'}
                                                    </span>
                                                </td>
                                                {admin && (
                                                    <td className="py-3 px-4">
                                                        {!detection.is_resolved ? (
                                                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                                                onClick={(e) => { e.stopPropagation(); markResolved(detection.id) }}
                                                                className="px-3 py-1 text-xs rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-all font-medium">
                                                                Mark Resolved
                                                            </motion.button>
                                                        ) : (
                                                            <span className="text-xs text-slate-500">—</span>
                                                        )}
                                                    </td>
                                                )}
                                            </motion.tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                            <p className="text-xs text-slate-500">Page {page} of {totalPages}</p>
                            <div className="flex items-center gap-2">
                                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} disabled={page === 1}
                                    onClick={() => setPage((p) => p - 1)}
                                    className="p-1.5 rounded bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                                    <ChevronLeft className="w-4 h-4" />
                                </motion.button>
                                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} disabled={page === totalPages}
                                    onClick={() => setPage((p) => p + 1)}
                                    className="p-1.5 rounded bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                                    <ChevronRight className="w-4 h-4" />
                                </motion.button>
                            </div>
                        </div>
                    </>
                )}
            </GlassCard>

            {/* Detail Panel */}
            <AnimatePresence>
                {selected && (
                    <>
                        <motion.div key="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => setSelected(null)} />
                        <motion.div key="panel" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                            className="fixed top-0 right-0 h-full w-full max-w-md z-50 bg-slate-900/95 border-l border-white/10 backdrop-blur-xl overflow-y-auto">
                            <div className="p-6">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-lg font-semibold text-white">Alert #{selected.id}</h2>
                                    <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium mb-6 ${getRiskColor(selected.risk_level).bg} border ${getRiskColor(selected.risk_level).border}`}>
                                    <StatusIcon status={getRiskColor(selected.risk_level).status} size="sm" />
                                    <span className={getRiskColor(selected.risk_level).text}>{selected.risk_level?.toUpperCase()} RISK</span>
                                </div>

                                <div className="space-y-4">
                                    {[
                                        { label: 'Detected At', value: formatTimestamp(selected.detected_at) },
                                        { label: 'Source IP', value: selected.src_ip, mono: true },
                                        { label: 'MAC Address', value: selected.src_mac || '—', mono: true },
                                        { label: 'Destination', value: selected.dst_domain || '—' },
                                        { label: 'Protocol', value: selected.protocol || '—' },
                                        { label: 'Device Type', value: selected.device_type || '—' },
                                        { label: 'Shadow IT Type', value: selected.shadow_it_type || '—' },
                                        { label: 'Bytes Sent', value: `${selected.bytes_sent.toLocaleString()} B` },
                                        { label: 'Bytes Received', value: `${selected.bytes_received.toLocaleString()} B` },
                                        { label: 'Duration', value: `${selected.duration}s` },
                                        { label: 'Anomaly Score', value: selected.anomaly_score != null ? selected.anomaly_score.toFixed(4) : '—', mono: true },
                                        { label: 'Status', value: selected.is_resolved ? 'RESOLVED' : 'OPEN' },
                                    ].map(({ label, value, mono }) => (
                                        <div key={label} className="flex items-start justify-between py-2 border-b border-white/5">
                                            <span className="text-xs text-slate-500 min-w-[120px]">{label}</span>
                                            <span className={`text-xs text-slate-700 dark:text-slate-200 text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
                                        </div>
                                    ))}
                                </div>

                                {admin && !selected.is_resolved && (
                                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={resolving}
                                        onClick={() => markResolved(selected.id)}
                                        className="w-full mt-6 py-2.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-all font-medium text-sm disabled:opacity-50">
                                        {resolving ? 'Resolving…' : 'Mark as Resolved'}
                                    </motion.button>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    )
}

export default function AlertsPage() {
    return (
        <Suspense fallback={null}>
            <AlertsPageInner />
        </Suspense>
    )
}
