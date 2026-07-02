'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
    RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip,
} from 'recharts'
import GlassCard from '@/components/ui/GlassCard'
import { StatusIcon } from '@/components/ui/StatusIcon'
import {
    BarChart3, FlaskConical, Download, CheckCircle, XCircle, Clock, Loader2,
} from 'lucide-react'
import { useIsDark, chartTooltipStyles } from '@/lib/useIsDark'
import { metricsApi, reportApi } from '@/lib/api'
import { isAdmin } from '@/lib/auth'
import type { MetricsResponse } from '@/lib/types'

type Tab = 'performance' | 'scenarios'

const RISK_COLOR = {
    high: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400' },
    medium: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400' },
    low: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' },
}

export default function ReportsPage() {
    const [activeTab, setActiveTab] = useState<Tab>('performance')
    const isDark = useIsDark()
    const tt = chartTooltipStyles(isDark)
    const tickColor = isDark ? '#64748b' : '#94a3b8'
    const admin = isAdmin()

    const [metrics, setMetrics] = useState<MetricsResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [exporting, setExporting] = useState(false)

    useEffect(() => {
        metricsApi.get()
            .then((res) => setMetrics(res.data))
            .catch((err) => setError(err?.response?.data?.error ?? 'No metrics found. Run ml/evaluate.py on the backend first.'))
            .finally(() => setLoading(false))
    }, [])

    const handleExportReport = async () => {
        setExporting(true)
        try {
            const res = await reportApi.generate()
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
            const a = document.createElement('a')
            a.href = url
            a.download = 'shadow-it-security-report.pdf'
            a.click()
            URL.revokeObjectURL(url)
        } catch (err) {
            console.error(err)
        } finally {
            setExporting(false)
        }
    }

    const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
        { id: 'performance', label: 'Model Performance', icon: BarChart3 },
        { id: 'scenarios', label: 'Test Scenarios', icon: FlaskConical },
    ]

    if (loading) {
        return <div className="flex items-center justify-center h-96"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
    }

    if (error || !metrics) {
        return (
            <GlassCard className="p-6">
                <p className="text-sm text-red-400">{error}</p>
            </GlassCard>
        )
    }

    const s = metrics.summary
    const METRICS = [
        { label: 'Accuracy', value: (s.accuracy ?? 0) * 100, color: '#3b82f6', description: 'Overall detection correctness' },
        { label: 'Precision', value: (s.precision ?? 0) * 100, color: '#10b981', description: 'Flagged items that are actual Shadow IT' },
        { label: 'Recall', value: (s.recall ?? 0) * 100, color: '#8b5cf6', description: 'Actual Shadow IT that was detected' },
        { label: 'F1-Score', value: (s.f1_score ?? 0) * 100, color: '#f59e0b', description: 'Harmonic mean of Precision & Recall' },
        { label: 'False Positive Rate', value: (s.false_positive_rate ?? 0) * 100, color: '#ef4444', description: 'Normal traffic incorrectly flagged', inverse: true },
    ]
    const specificity = s.tn != null && s.fp != null && (s.tn + s.fp) > 0 ? (s.tn / (s.tn + s.fp)) * 100 : 0
    const RADAR_DATA = [
        { metric: 'Accuracy', value: (s.accuracy ?? 0) * 100 },
        { metric: 'Precision', value: (s.precision ?? 0) * 100 },
        { metric: 'Recall', value: (s.recall ?? 0) * 100 },
        { metric: 'F1-Score', value: (s.f1_score ?? 0) * 100 },
        { metric: 'Specificity', value: specificity },
    ]
    const detectedCount = metrics.scenarios.filter((sc) => sc.correct).length
    const totalScenarios = metrics.scenarios.length

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <BarChart3 className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                        Reports &amp; Analytics
                    </h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        Real IsolationForest model performance from ml/evaluate.py
                    </p>
                </div>
                {admin && (
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleExportReport} disabled={exporting}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-all disabled:opacity-50">
                        {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Generate PDF Report
                    </motion.button>
                )}
            </div>

            <GlassCard className="p-5">
                <div className="flex flex-wrap gap-2">
                    {tabs.map((tab) => {
                        const Icon = tab.icon
                        return (
                            <motion.button key={tab.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id
                                    ? 'bg-blue-600 text-white border border-blue-600'
                                    : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-400 border border-slate-300 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10'}`}>
                                <Icon className="w-4 h-4" /> {tab.label}
                            </motion.button>
                        )
                    })}
                </div>
            </GlassCard>

            {activeTab === 'performance' && (
                <div className="space-y-5">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {METRICS.map((m) => (
                            <GlassCard key={m.label} className="p-4">
                                <p className="text-xs text-slate-500 dark:text-slate-500 mb-2 leading-tight">{m.label}</p>
                                <p className="text-3xl font-bold mb-1" style={{ color: m.color }}>{m.value.toFixed(1)}%</p>
                                <p className="text-xs text-slate-500 dark:text-slate-600 leading-snug">{m.description}</p>
                                <div className="mt-3 h-1.5 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
                                    <motion.div initial={{ width: 0 }} animate={{ width: `${m.inverse ? 100 - m.value : m.value}%` }}
                                        transition={{ duration: 0.8, ease: 'easeOut' }} className="h-full rounded-full" style={{ background: m.color }} />
                                </div>
                            </GlassCard>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <GlassCard className="p-6">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Performance Radar</h3>
                            <ResponsiveContainer width="100%" height={260}>
                                <RadarChart data={RADAR_DATA}>
                                    <PolarGrid stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'} />
                                    <PolarAngleAxis dataKey="metric" tick={{ fill: tickColor, fontSize: 11 }} />
                                    <Radar dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} dot={{ r: 3, fill: '#3b82f6' }} />
                                    <Tooltip contentStyle={tt.contentStyle} labelStyle={tt.labelStyle} itemStyle={tt.itemStyle} formatter={(v: number) => [`${v.toFixed(1)}%`, 'Score']} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </GlassCard>

                        <GlassCard className="p-6">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Confusion Matrix</h3>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { label: 'True Positive', value: s.tp, color: '#10b981' },
                                    { label: 'True Negative', value: s.tn, color: '#3b82f6' },
                                    { label: 'False Positive', value: s.fp, color: '#ef4444' },
                                    { label: 'False Negative', value: s.fn, color: '#f59e0b' },
                                ].map((c) => (
                                    <div key={c.label} className="p-4 rounded-xl text-center" style={{ background: `${c.color}15`, border: `1px solid ${c.color}30` }}>
                                        <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value ?? '—'}</p>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-wide">{c.label}</p>
                                    </div>
                                ))}
                            </div>
                            {s.detection_time_s != null && (
                                <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                    <Clock className="w-3.5 h-3.5" /> Evaluation completed in {s.detection_time_s.toFixed(3)}s
                                </div>
                            )}
                        </GlassCard>
                    </div>

                    <GlassCard className="p-6">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Isolation Forest Anomaly Score</h3>
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/8 font-mono text-sm text-slate-800 dark:text-slate-300 text-center">
                            s(x, n) = 2 <sup>− E(h(x)) / c(n)</sup>
                        </div>
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-500 dark:text-slate-400">
                            <p><span className="font-semibold text-slate-700 dark:text-slate-300">E(h(x))</span> — Average path length of point x across all isolation trees</p>
                            <p><span className="font-semibold text-slate-700 dark:text-slate-300">c(n)</span> — Average path length of unsuccessful binary search tree search (normalisation)</p>
                            <p><span className="font-semibold text-slate-700 dark:text-slate-300">Score → 1</span> — Anomaly. <span className="font-semibold text-slate-700 dark:text-slate-300">Score → 0.5</span> — Normal traffic</p>
                        </div>
                    </GlassCard>
                </div>
            )}

            {activeTab === 'scenarios' && (
                <div className="space-y-5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                            { label: 'Total Scenarios', value: String(totalScenarios), color: 'text-blue-400' },
                            { label: 'Correct', value: String(detectedCount), color: 'text-emerald-400' },
                            { label: 'Incorrect', value: String(totalScenarios - detectedCount), color: 'text-red-400' },
                            { label: 'Accuracy', value: totalScenarios ? `${Math.round((detectedCount / totalScenarios) * 100)}%` : '—', color: 'text-purple-400' },
                        ].map((st) => (
                            <GlassCard key={st.label} className="p-4">
                                <p className="text-xs text-slate-500 mb-2">{st.label}</p>
                                <p className={`text-3xl font-bold ${st.color}`}>{st.value}</p>
                            </GlassCard>
                        ))}
                    </div>

                    <GlassCard className="overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10">
                            <h3 className="font-semibold text-slate-900 dark:text-white">Predefined Test Scenarios</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-100 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                                    <tr className="text-xs text-slate-700 dark:text-slate-400 font-semibold uppercase tracking-wider">
                                        <th className="text-left py-3 px-4">ID</th>
                                        <th className="text-left py-3 px-4">Type</th>
                                        <th className="text-left py-3 px-4">Description</th>
                                        <th className="text-left py-3 px-4">Expected</th>
                                        <th className="text-left py-3 px-4">Predicted</th>
                                        <th className="text-left py-3 px-4">Score</th>
                                        <th className="text-left py-3 px-4">Risk</th>
                                        <th className="text-left py-3 px-4">Time</th>
                                        <th className="text-left py-3 px-4">Result</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {metrics.scenarios.length === 0 ? (
                                        <tr><td colSpan={9} className="py-8 text-center text-slate-500 text-sm">No scenario results found</td></tr>
                                    ) : metrics.scenarios.map((sc, idx) => {
                                        const rc = RISK_COLOR[(sc.risk_level as keyof typeof RISK_COLOR) ?? 'low'] ?? RISK_COLOR.low
                                        return (
                                            <motion.tr key={sc.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }}
                                                className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                                                <td className="py-3 px-4"><span className="px-2 py-1 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 text-xs font-bold">{sc.id}</span></td>
                                                <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300 capitalize">{sc.shadow_it_type}</td>
                                                <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300 max-w-xs">{sc.description}</td>
                                                <td className="py-3 px-4 text-xs font-mono text-slate-600 dark:text-slate-400">{sc.expected}</td>
                                                <td className="py-3 px-4 text-xs font-mono text-slate-600 dark:text-slate-400">{sc.predicted}</td>
                                                <td className="py-3 px-4 text-xs font-bold text-amber-500 dark:text-amber-400">{sc.anomaly_score != null ? sc.anomaly_score.toFixed(4) : '—'}</td>
                                                <td className="py-3 px-4">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${rc.bg} ${rc.text} border ${rc.border}`}>
                                                        <StatusIcon status={(sc.risk_level as 'high' | 'medium' | 'low') ?? 'low'} size="sm" /> {sc.risk_level?.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-xs text-slate-500">{sc.response_ms != null ? `${sc.response_ms}ms` : '—'}</td>
                                                <td className="py-3 px-4">
                                                    {sc.correct
                                                        ? <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle className="w-4 h-4" /> Correct</span>
                                                        : <span className="flex items-center gap-1 text-xs font-semibold text-red-500"><XCircle className="w-4 h-4" /> Incorrect</span>}
                                                </td>
                                            </motion.tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </GlassCard>
                </div>
            )}
        </div>
    )
}
