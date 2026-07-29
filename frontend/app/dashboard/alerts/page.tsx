'use client'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import GlassCard from '@/components/ui/GlassCard'
import AnimatedCounter from '@/components/ui/AnimatedCounter'
import { StatusIcon } from '@/components/ui/StatusIcon'
import {
    TrendingUp, AlertCircle, CheckCircle, X, ChevronLeft, ChevronRight, Download, Loader2, ShieldAlert, Ban,
} from 'lucide-react'
import { detectionsApi, statsApi, firewallApi, apiErrorMessage } from '@/lib/api'
import { isAdmin } from '@/lib/auth'
import type { Detection, DashboardSummary } from '@/lib/types'

// A generated firewall rule (from POST /api/firewall/rules/generate) awaiting
// the admin's confirm-to-apply in the Block flow.
type FirewallRule = {
    id: number
    target_ip: string
    target_label: string
    enforcement_kind: string
    rule_action: string
    dst_domain: string | null
    rationale: string
    command_text: string
    status?: string
    execution_output?: string | null
}

const getRiskColor = (risk: string | null) => {
    switch (risk) {
        case 'high': return { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', status: 'high' as const }
        case 'medium': return { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', status: 'medium' as const }
        case 'low': return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', status: 'low' as const }
        default: return { bg: 'bg-slate-500/10', border: 'border-slate-500/20', text: 'text-slate-400', status: 'low' as const }
    }
}

// How each detection was found: an unsanctioned known cloud app (catalog),
// an ML anomaly, or an active network scan.
const SOURCE_META: Record<string, { label: string; cls: string }> = {
    catalog:              { label: 'Unsanctioned SaaS',  cls: 'bg-red-500/15 text-red-300 border-red-500/25' },
    anomaly:              { label: 'ML Anomaly',         cls: 'bg-blue-500/15 text-blue-300 border-blue-500/25' },
    'active-scan':        { label: 'Network Scan',       cls: 'bg-purple-500/15 text-purple-300 border-purple-500/25' },
    'concurrent-session': { label: 'Concurrent Session', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/25' },
    wazuh:                { label: 'Wazuh Inventory',    cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
    radius:               { label: 'RADIUS/AAA',         cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25' },
}
const sourceMeta = (s?: string | null) =>
    (s && SOURCE_META[s]) || { label: s || '—', cls: 'bg-slate-500/15 text-slate-300 border-slate-500/25' }

function formatTimestamp(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const PAGE_SIZE = 20

function AlertsPageInner() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const admin = isAdmin()

    const [detections, setDetections] = useState<Detection[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [typeFilter, setTypeFilter] = useState('')
    const [riskFilter, setRiskFilter] = useState(searchParams.get('risk') || '')
    const [sourceFilter, setSourceFilter] = useState(searchParams.get('source') || '')
    const [loading, setLoading] = useState(true)
    const [selected, setSelected] = useState<Detection | null>(null)
    const [resolving, setResolving] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [summary, setSummary] = useState<DashboardSummary | null>(null)
    const [suggesting, setSuggesting] = useState(false)
    const [suggestError, setSuggestError] = useState('')
    const [suggestInfo, setSuggestInfo] = useState('')
    // Direct one-click block: generate a rule, preview it, apply on confirm.
    const [blockRule, setBlockRule] = useState<FirewallRule | null>(null)
    const [blocking, setBlocking] = useState(false)
    const [blockResult, setBlockResult] = useState<{ ok: boolean; text: string } | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const params: Record<string, unknown> = { page, per_page: PAGE_SIZE }
            if (typeFilter) params.type = typeFilter
            if (riskFilter) params.risk = riskFilter
            if (sourceFilter) params.source = sourceFilter
            const res = await detectionsApi.list(params)
            setDetections(res.data.detections || [])
            setTotal(res.data.total || 0)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }, [page, typeFilter, riskFilter, sourceFilter])

    useEffect(() => { load() }, [load])
    useEffect(() => { statsApi.get().then((r) => setSummary(r.data)).catch(() => {}) }, [])
    useEffect(() => { setPage(1) }, [typeFilter, riskFilter, sourceFilter])
    useEffect(() => { setSuggestError(''); setSuggestInfo(''); setBlockRule(null); setBlockResult(null) }, [selected])

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

    const handleSuggestRule = async (id: number) => {
        setSuggesting(true); setSuggestError(''); setSuggestInfo('')
        try {
            const res = await firewallApi.generate(id)
            setSuggestInfo(`Suggested rule created for ${res.data.target_label || res.data.target_ip} — review it on the Firewall Rules page.`)
        } catch (err) {
            setSuggestError(apiErrorMessage(err, 'Could not generate a rule suggestion'))
        } finally {
            setSuggesting(false)
        }
    }

    // Step 1 of the direct block: generate the rule and show it for confirmation.
    const startBlock = async (id: number) => {
        setBlocking(true); setBlockResult(null); setBlockRule(null)
        try {
            const res = await firewallApi.generate(id)
            setBlockRule(res.data as FirewallRule)
        } catch (err) {
            setBlockResult({ ok: false, text: apiErrorMessage(err, 'Could not prepare a block rule') })
        } finally {
            setBlocking(false)
        }
    }

    // Step 2: admin confirmed — approve the rule, which actually runs the command.
    const confirmBlock = async () => {
        if (!blockRule) return
        setBlocking(true)
        try {
            const res = await firewallApi.review(blockRule.id, 'approved')
            const applied = res.data.status === 'applied'
            setBlockResult({ ok: applied, text: res.data.execution_output || (applied ? 'Block applied.' : 'Apply failed.') })
            setBlockRule(null)
        } catch (err) {
            setBlockResult({ ok: false, text: apiErrorMessage(err, 'Apply failed') })
        } finally {
            setBlocking(false)
        }
    }

    const handleExport = async () => {
        setExporting(true)
        try {
            const params: Record<string, unknown> = {}
            if (typeFilter) params.type = typeFilter
            if (riskFilter) params.risk = riskFilter
            if (sourceFilter) params.source = sourceFilter
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
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50">
                        <option value="">All Sources</option>
                        <option value="catalog">Unsanctioned SaaS</option>
                        <option value="anomaly">ML Anomaly</option>
                        <option value="active-scan">Network Scan</option>
                        <option value="concurrent-session">Concurrent Session</option>
                        <option value="wazuh">Wazuh Inventory</option>
                        <option value="radius">RADIUS/AAA</option>
                    </select>
                    <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50">
                        <option value="">All Types</option>
                        <option value="software">Software</option>
                        <option value="hardware">Hardware</option>
                        <option value="mixed">Mixed</option>
                        <option value="identity">Identity</option>
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
                                        <th className="text-left py-3 px-4">Source</th>
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
                                                <td className="py-3 px-4 text-xs">
                                                    <span className={`px-2 py-1 rounded border text-[11px] font-medium ${sourceMeta(detection.detection_source).cls}`}>
                                                        {sourceMeta(detection.detection_source).label}
                                                    </span>
                                                </td>
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
                            className="fixed top-0 right-0 h-full w-full max-w-md z-50 border-l overflow-y-auto"
                            style={{ background: '#ffffff', borderColor: '#e6e9e8' }}>
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
                                        { label: 'Detection Source', value: sourceMeta(selected.detection_source).label },
                                        { label: 'App Category', value: selected.app_category || '—' },
                                        { label: 'Protocol', value: selected.protocol || '—' },
                                        { label: 'Device', value: selected.device_type || '—' },
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

                                {admin && !blockRule && (
                                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={blocking}
                                        onClick={() => startBlock(selected.id)}
                                        className="w-full mt-3 py-2.5 rounded-lg bg-red-600 text-white hover:bg-red-500 transition-all font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                                        {blocking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                                        {blocking ? 'Preparing…' : 'Block This Source'}
                                    </motion.button>
                                )}

                                {admin && blockRule && (
                                    <div className="mt-3 p-3 rounded-lg border border-red-500/30 bg-red-500/5 space-y-2">
                                        <p className="text-[11px] uppercase tracking-wide text-red-400 font-semibold">Confirm block · {blockRule.target_label} ({blockRule.target_ip})</p>
                                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{blockRule.rationale}</p>
                                        <pre className="text-[11px] font-mono whitespace-pre-wrap bg-black/40 text-red-200 rounded p-2 overflow-x-auto">{blockRule.command_text}</pre>
                                        {blockRule.enforcement_kind === 'unknown' && (
                                            <p className="text-[11px] text-amber-400">No managed enforcement point for {blockRule.target_ip} — advisory only; confirming records it without executing a command.</p>
                                        )}
                                        <div className="flex gap-2 pt-1">
                                            <button onClick={confirmBlock} disabled={blocking}
                                                className="flex-1 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                                                {blocking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                                {blocking ? 'Applying…' : blockRule.enforcement_kind === 'unknown' ? 'Acknowledge' : `Apply ${blockRule.rule_action}`}
                                            </button>
                                            <button onClick={() => setBlockRule(null)} disabled={blocking}
                                                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 text-xs disabled:opacity-50">
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {admin && blockResult && (
                                    <div className={`mt-3 p-3 rounded-lg border text-xs ${blockResult.ok ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-500' : 'bg-red-500/10 border-red-500/25 text-red-400'}`}>
                                        {blockResult.ok ? '✓ Blocked — ' : '✗ Failed — '}{blockResult.text}{' '}
                                        <button onClick={() => router.push('/dashboard/firewall-rules')} className="underline font-medium">Firewall Rules →</button>
                                    </div>
                                )}

                                {admin && (
                                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={suggesting}
                                        onClick={() => handleSuggestRule(selected.id)}
                                        className="w-full mt-3 py-2.5 rounded-lg bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/30 transition-all font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                                        {suggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                                        {suggesting ? 'Generating…' : 'Suggest Firewall Rule (draft only)'}
                                    </motion.button>
                                )}
                                {suggestError && <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-xs text-red-400">{suggestError}</div>}
                                {suggestInfo && (
                                    <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-500">
                                        {suggestInfo}{' '}
                                        <button onClick={() => router.push('/dashboard/firewall-rules')} className="underline font-medium">View →</button>
                                    </div>
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
