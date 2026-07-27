'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import GlassCard from '@/components/ui/GlassCard'
import { firewallApi, apiErrorMessage } from '@/lib/api'
import { isAdmin } from '@/lib/auth'
import {
    ShieldAlert, X, Check, Ban, Loader2, ChevronLeft, ChevronRight,
    Copy, CheckCheck, Server, Monitor, Box, HelpCircle,
} from 'lucide-react'
import type { FirewallRule, FirewallRuleStatus } from '@/lib/types'

const FILTERS: { value: FirewallRuleStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'applied', label: 'Applied' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'apply_failed', label: 'Failed' },
]

const STATUS_META: Record<FirewallRuleStatus, { label: string; cls: string }> = {
    pending:      { label: 'Pending',  cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/25' },
    applied:      { label: 'Applied',  cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/25' },
    rejected:     { label: 'Rejected', cls: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/25' },
    apply_failed: { label: 'Failed',   cls: 'bg-red-500/15 text-red-600 dark:text-red-300 border-red-500/25' },
}

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
    'linux-ufw-host': Server,
    'windows-vm': Monitor,
    'macvlan-container': Box,
    unknown: HelpCircle,
}

const formatTimestamp = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

const PAGE_SIZE = 20

export default function FirewallRulesPage() {
    const router = useRouter()
    useEffect(() => { if (!isAdmin()) router.push('/dashboard') }, [router])

    const [rules, setRules] = useState<FirewallRule[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<FirewallRuleStatus | 'all'>('all')
    const [selected, setSelected] = useState<FirewallRule | null>(null)
    const [reviewing, setReviewing] = useState(false)
    const [reviewError, setReviewError] = useState('')
    const [copied, setCopied] = useState(false)

    const load = () => {
        setLoading(true)
        const params: Record<string, unknown> = { page, per_page: PAGE_SIZE }
        if (filter !== 'all') params.status = filter
        firewallApi.list(params)
            .then((res) => { setRules(res.data.rules); setTotal(res.data.total) })
            .catch((err) => console.error(err))
            .finally(() => setLoading(false))
    }

    useEffect(load, [page, filter])

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

    const handleReview = async (status: 'approved' | 'rejected') => {
        if (!selected) return
        setReviewing(true); setReviewError('')
        try {
            const res = await firewallApi.review(selected.id, status)
            setSelected(res.data)
            load()
        } catch (err) {
            setReviewError(apiErrorMessage(err, 'Review failed'))
        } finally {
            setReviewing(false)
        }
    }

    const copyCommand = () => {
        if (!selected) return
        navigator.clipboard.writeText(selected.command_text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                    <ShieldAlert className="w-8 h-8 text-red-600 dark:text-red-400" />
                    Firewall Rules
                </h1>
                <p className="text-sm text-slate-700 dark:text-slate-400">
                    Auto-suggested enforcement actions generated from detections. Nothing is ever applied
                    without approval — Approve actually runs the command against the real target.
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {(['pending', 'applied', 'rejected', 'apply_failed'] as FirewallRuleStatus[]).map((s) => (
                    <GlassCard key={s} className="p-4">
                        <p className="text-xs font-semibold text-slate-900 dark:text-slate-500 mb-2">{STATUS_META[s].label}</p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">
                            {filter === s ? total : rules.filter((r) => r.status === s).length}
                            {filter !== s && <span className="text-xs font-normal text-slate-500"> (this page)</span>}
                        </p>
                    </GlassCard>
                ))}
            </div>

            {/* Filters */}
            <GlassCard className="p-6">
                <div className="flex flex-wrap gap-2">
                    {FILTERS.map((f) => (
                        <motion.button key={f.value} whileHover={{ scale: 1.02 }}
                            onClick={() => { setFilter(f.value); setPage(1) }}
                            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${filter === f.value
                                ? 'bg-red-600 text-white border border-red-600'
                                : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-400 border border-slate-300 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10'}`}>
                            {f.label}
                        </motion.button>
                    ))}
                </div>
            </GlassCard>

            {/* Table */}
            <GlassCard className="overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-300 dark:border-white/10 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">Suggested rules</span>
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
                                <th className="text-left px-4 py-3">Target</th>
                                <th className="text-left px-3 py-3">Action</th>
                                <th className="text-left px-3 py-3">Destination</th>
                                <th className="text-left px-3 py-3">Status</th>
                                <th className="text-left px-3 py-3">Created</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={5} className="px-6 py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-red-400" /></td></tr>
                            ) : rules.length === 0 ? (
                                <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-600 dark:text-slate-400 text-sm">No firewall rules found</td></tr>
                            ) : rules.map((r) => {
                                const KindIcon = KIND_ICON[r.enforcement_kind] || HelpCircle
                                return (
                                    <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                        onClick={() => setSelected(r)}
                                        className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/4 transition-colors cursor-pointer">
                                        <td className="px-4 py-3 align-middle">
                                            <div className="flex items-center gap-2">
                                                <KindIcon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                                <div>
                                                    <div className="text-sm font-medium text-slate-800 dark:text-white">{r.target_label || r.target_ip}</div>
                                                    <div className="text-[11px] font-mono text-slate-500">{r.target_ip}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 align-middle text-xs text-slate-700 dark:text-slate-300 capitalize">{r.rule_action.replace('-', ' ')}</td>
                                        <td className="px-3 py-3 align-middle max-w-[200px] truncate text-xs text-slate-600 dark:text-slate-400">{r.dst_domain || '—'}</td>
                                        <td className="px-3 py-3 align-middle">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold border ${STATUS_META[r.status].cls}`}>
                                                {STATUS_META[r.status].label}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 align-middle text-xs text-slate-500">{formatTimestamp(r.created_at)}</td>
                                    </motion.tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </GlassCard>

            {/* Detail panel */}
            <AnimatePresence>
                {selected && (
                    <>
                        <motion.div key="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => setSelected(null)} />
                        <motion.div key="panel" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                            className="fixed top-0 right-0 h-full w-full max-w-lg z-50 bg-white dark:bg-slate-900/98 border-l border-slate-200 dark:border-white/10 backdrop-blur-xl overflow-y-auto">
                            <div className="p-6">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Rule Detail</h2>
                                    <button onClick={() => setSelected(null)}
                                        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white transition-all">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="mb-6">
                                    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border ${STATUS_META[selected.status].cls}`}>
                                        {STATUS_META[selected.status].label}
                                    </span>
                                </div>

                                <div className="space-y-3 mb-6">
                                    {[
                                        { label: 'Target', value: `${selected.target_label || selected.target_ip} (${selected.target_ip})` },
                                        { label: 'Enforcement kind', value: selected.enforcement_kind },
                                        { label: 'Action', value: selected.rule_action.replace('-', ' ') },
                                        { label: 'Destination', value: selected.dst_domain || '—' },
                                        { label: 'Created', value: formatTimestamp(selected.created_at) },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="flex items-start justify-between py-2.5 border-b border-slate-100 dark:border-white/5">
                                            <span className="text-xs text-slate-500 dark:text-slate-400 min-w-[120px]">{label}</span>
                                            <span className="text-xs text-slate-900 dark:text-slate-200 text-right ml-4">{value}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="mb-4">
                                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Rationale</p>
                                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{selected.rationale}</p>
                                </div>

                                <div className="mb-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Command</p>
                                        <button onClick={copyCommand} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white transition-all">
                                            {copied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                            {copied ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>
                                    <pre className="text-xs font-mono bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all text-slate-800 dark:text-slate-200">{selected.command_text}</pre>
                                </div>

                                {selected.execution_output && (
                                    <div className="mb-4">
                                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Execution output</p>
                                        <pre className="text-xs font-mono bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all text-slate-600 dark:text-slate-400">{selected.execution_output}</pre>
                                    </div>
                                )}

                                {reviewError && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-400">{reviewError}</div>}

                                {(selected.status === 'pending' || selected.status === 'apply_failed') && (
                                    <div className="flex gap-3 mt-6">
                                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={reviewing}
                                            onClick={() => handleReview('approved')}
                                            className="flex-1 py-2.5 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-all font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                                            {reviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                            {selected.status === 'apply_failed' ? 'Retry' : 'Approve & Apply'}
                                        </motion.button>
                                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={reviewing}
                                            onClick={() => handleReview('rejected')}
                                            className="flex-1 py-2.5 rounded-lg bg-slate-500/10 text-slate-600 dark:text-slate-300 hover:bg-slate-500/20 border border-slate-500/30 transition-all font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                                            <Ban className="w-4 h-4" />
                                            {selected.status === 'apply_failed' ? 'Give up' : 'Reject'}
                                        </motion.button>
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
