'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useIsDark, chartTooltipStyles } from '@/lib/useIsDark'
import GlassCard from '@/components/ui/GlassCard'
import AnimatedCounter from '@/components/ui/AnimatedCounter'
import { StatusIcon } from '@/components/ui/StatusIcon'
import {
    TrendingUp, CheckCircle2, Cpu, Code2, Globe, Smartphone, Play, Download, Loader2,
} from 'lucide-react'
import { statsApi, detectionsApi, reportApi, apiErrorMessage } from '@/lib/api'
import { fetchAllDetections, groupByApplication } from '@/lib/aggregate'
import { isAdmin } from '@/lib/auth'
import type { DashboardSummary, TimelinePoint, TopOffender } from '@/lib/types'

function formatTimestamp(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function DashboardPage() {
    const router = useRouter()
    const isDark = useIsDark()
    const tt = chartTooltipStyles(isDark)
    const admin = isAdmin()

    const [summary, setSummary] = useState<DashboardSummary | null>(null)
    const [timeline, setTimeline] = useState<TimelinePoint[]>([])
    const [topDevices, setTopDevices] = useState<TopOffender[]>([])
    const [topDomains, setTopDomains] = useState<{ name: string; count: number; percentage: number }[]>([])
    const [loading, setLoading] = useState(true)
    const [days, setDays] = useState<7 | 30>(7)
    const [running, setRunning] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [actionMsg, setActionMsg] = useState('')

    const fetchData = useCallback(async () => {
        try {
            const [statsRes, timelineRes, offendersRes] = await Promise.all([
                statsApi.get(),
                statsApi.timeline(days),
                statsApi.topOffenders(5),
            ])
            setSummary(statsRes.data)
            setTimeline(timelineRes.data)
            setTopDevices(offendersRes.data)

            const { rows } = await fetchAllDetections(300)
            const apps = groupByApplication(rows)
            const totalApp = apps.reduce((s, a) => s + a.count, 0) || 1
            setTopDomains(
                apps.slice(0, 5).map((a) => ({
                    name: a.dst_domain,
                    count: a.count,
                    percentage: Math.round((a.count / totalApp) * 100),
                }))
            )
        } catch (err) {
            console.error('Failed to fetch dashboard data:', err)
        } finally {
            setLoading(false)
        }
    }, [days])

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 30000)
        return () => clearInterval(interval)
    }, [fetchData])

    const handleRunDetection = async () => {
        setRunning(true)
        setActionMsg('')
        try {
            const res = await detectionsApi.runDetection()
            setActionMsg(res.data.message)
            await fetchData()
        } catch (err) {
            setActionMsg(apiErrorMessage(err, 'Run detection failed'))
        } finally {
            setRunning(false)
        }
    }

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

    if (loading || !summary) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-slate-900 dark:text-slate-500 animate-pulse">Loading dashboard...</div>
            </div>
        )
    }

    const byType = summary.by_type || {}
    const byRisk = summary.by_risk || {}

    const summaryStats = [
        { label: 'Total Detections',   value: summary.total_detections, icon: TrendingUp,   colorKey: 'blue',   status: null },
        { label: 'Unresolved',         value: summary.unresolved,       icon: null,         colorKey: 'red',    status: 'high' as const },
        { label: 'Resolved',           value: summary.resolved,         icon: CheckCircle2, colorKey: 'low',    status: null },
        { label: 'Software Shadow IT', value: byType.software ?? 0,     icon: Code2,        colorKey: 'purple', status: null },
        { label: 'Hardware Shadow IT', value: byType.hardware ?? 0,     icon: Cpu,          colorKey: 'orange', status: null },
        { label: 'High Risk',          value: byRisk.high ?? 0,         icon: null,         colorKey: 'high',   status: 'high' as const },
    ]

    const COUNTER_CLASS: Record<string, string> = {
        blue: 'text-blue-400', red: 'text-red-400', orange: 'text-orange-400',
        purple: 'text-purple-400', high: 'text-red-400', medium: 'text-amber-400', low: 'text-emerald-400',
    }

    const getRiskColor = (risk: string | null) => {
        switch (risk) {
            case 'high': return { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', status: 'high' as const }
            case 'medium': return { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', status: 'medium' as const }
            case 'low': return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', status: 'low' as const }
            default: return { bg: 'bg-slate-500/10', border: 'border-slate-500/20', text: 'text-slate-400', status: 'low' as const }
        }
    }

    const total = summary.total_detections || 1
    const trendData = timeline.map((t) => ({ period: t.day.slice(5), value: t.count }))
    const trendMax = Math.max(...trendData.map((d) => d.value), 1)

    return (
        <div className="space-y-6">
            {admin && (
                <div className="flex items-center justify-end gap-3">
                    {actionMsg && <span className="text-xs text-slate-500 dark:text-slate-400">{actionMsg}</span>}
                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleExportReport} disabled={exporting}
                        className="text-xs px-4 py-2 rounded-lg bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-white/10 border border-white/10 transition-all font-medium flex items-center gap-2 disabled:opacity-50">
                        {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Export Report
                    </motion.button>
                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleRunDetection} disabled={running}
                        className="text-xs px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all font-medium flex items-center gap-2 disabled:opacity-50">
                        {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Run Detection
                    </motion.button>
                </div>
            )}

            {/* Summary Cards Row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                {summaryStats.map((stat) => (
                    <motion.div key={stat.label} whileHover={{ y: -4 }}>
                        <GlassCard className="p-4 h-full hover:bg-white/10 transition-all cursor-pointer group">
                            <div className="flex flex-col h-full">
                                <div className="flex items-start justify-between mb-2 text-2xl">
                                    {stat.status
                                        ? <StatusIcon status={stat.status} size="lg" />
                                        : stat.icon && <stat.icon className="w-6 h-6" />}
                                </div>
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-500 mb-2 flex-1">{stat.label}</p>
                                <AnimatedCounter
                                    value={stat.value}
                                    className={`text-2xl font-bold ${COUNTER_CLASS[stat.colorKey] ?? 'text-slate-400'}`}
                                />
                            </div>
                        </GlassCard>
                    </motion.div>
                ))}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Risk Distribution */}
                <GlassCard className="p-6">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">Risk Distribution</h3>
                    <div className="space-y-4">
                        {[
                            { label: 'High Risk', value: byRisk.high ?? 0, textCls: 'text-red-400', barCls: 'bg-red-500/60' },
                            { label: 'Medium Risk', value: byRisk.medium ?? 0, textCls: 'text-amber-400', barCls: 'bg-amber-500/60' },
                            { label: 'Low Risk', value: byRisk.low ?? 0, textCls: 'text-emerald-400', barCls: 'bg-emerald-500/60' },
                        ].map(item => (
                            <div key={item.label}>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-medium text-slate-900 dark:text-slate-400">{item.label}</span>
                                    <span className={`text-sm font-bold ${item.textCls}`}>{item.value} ({Math.round((item.value / total) * 100)}%)</span>
                                </div>
                                <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/10">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.round((item.value / total) * 100)}%` }}
                                        transition={{ duration: 0.8, ease: 'easeOut' }}
                                        className={`h-full ${item.barCls} rounded-full`}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </GlassCard>

                {/* Shadow IT Type Breakdown */}
                <GlassCard className="p-6">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">Shadow IT Types</h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                            <div className="flex items-center gap-3">
                                <Code2 className="w-6 h-6 text-purple-400" />
                                <div>
                                    <p className="text-sm font-medium text-white">Software</p>
                                    <p className="text-xs text-slate-900 dark:text-slate-500">Unauthorized apps</p>
                                </div>
                            </div>
                            <p className="text-2xl font-bold text-purple-400">{byType.software ?? 0}</p>
                        </div>
                        <div className="flex items-center justify-between p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
                            <div className="flex items-center gap-3">
                                <Cpu className="w-6 h-6 text-orange-400" />
                                <div>
                                    <p className="text-sm font-medium text-white">Hardware</p>
                                    <p className="text-xs text-slate-900 dark:text-slate-500">Unauthorized devices</p>
                                </div>
                            </div>
                            <p className="text-2xl font-bold text-orange-400">{byType.hardware ?? 0}</p>
                        </div>
                        {byType.mixed != null && (
                            <div className="flex items-center justify-between p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                <div className="flex items-center gap-3">
                                    <Smartphone className="w-6 h-6 text-amber-400" />
                                    <div>
                                        <p className="text-sm font-medium text-white">Mixed</p>
                                        <p className="text-xs text-slate-900 dark:text-slate-500">Hardware + software</p>
                                    </div>
                                </div>
                                <p className="text-2xl font-bold text-amber-400">{byType.mixed}</p>
                            </div>
                        )}
                    </div>
                </GlassCard>

                {/* Detection Timeline — real /api/stats/timeline */}
                <GlassCard className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Detection Timeline</h3>
                        <div className="flex gap-2">
                            <button onClick={() => setDays(7)}
                                className={`px-2 py-1 text-xs rounded transition-all ${days === 7 ? 'bg-blue-500/40 text-blue-300' : 'text-slate-900 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                                7 days
                            </button>
                            <button onClick={() => setDays(30)}
                                className={`px-2 py-1 text-xs rounded transition-all ${days === 30 ? 'bg-blue-500/40 text-blue-300' : 'text-slate-900 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                                30 days
                            </button>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={128}>
                        <BarChart data={trendData} barSize={days === 7 ? 18 : 8}>
                            <XAxis dataKey="period" tick={{ fill: isDark ? '#64748b' : '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis hide domain={[0, trendMax * 1.2]} />
                            <Tooltip contentStyle={tt.contentStyle} labelStyle={tt.labelStyle} itemStyle={tt.itemStyle} cursor={tt.cursor}
                                formatter={(v: number) => [v, 'Detections']} />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                {trendData.map((entry, idx) => (
                                    <Cell key={idx} fill={entry.value === trendMax ? 'rgba(59,130,246,0.8)' : 'rgba(59,130,246,0.4)'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </GlassCard>
            </div>

            {/* Recent Alerts Table — real */}
            <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Recent Alerts</h3>
                        <p className="text-xs text-slate-700 dark:text-slate-500 mt-1">Latest detected anomalies</p>
                    </div>
                    <Link href="/dashboard/alerts">
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                            className="text-xs px-4 py-2 rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/30 transition-all font-medium">
                            View All Alerts →
                        </motion.button>
                    </Link>
                </div>

                {summary.recent_alerts.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-slate-900 dark:text-slate-500">No recent alerts</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-white/10">
                                <tr className="text-xs text-slate-900 dark:text-slate-500 font-medium">
                                    <th className="text-left py-3 px-4">Timestamp</th>
                                    <th className="text-left py-3 px-4">Source IP</th>
                                    <th className="text-left py-3 px-4">Destination</th>
                                    <th className="text-left py-3 px-4">Type</th>
                                    <th className="text-left py-3 px-4">Risk Level</th>
                                    <th className="text-left py-3 px-4">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.recent_alerts.map((detection) => {
                                    const riskConfig = getRiskColor(detection.risk_level)
                                    return (
                                        <motion.tr key={detection.id} whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                                            onClick={() => router.push('/dashboard/alerts')}
                                            className="border-b border-white/5 hover:bg-white/5 transition-all cursor-pointer">
                                            <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">{formatTimestamp(detection.detected_at)}</td>
                                            <td className="py-3 px-4 text-xs font-mono text-slate-300">{detection.src_ip}</td>
                                            <td className="py-3 px-4 text-xs text-slate-300">{detection.dst_domain || '—'}</td>
                                            <td className="py-3 px-4 text-xs">
                                                <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-300">{detection.shadow_it_type || 'Unknown'}</span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${riskConfig.bg} border ${riskConfig.border}`}>
                                                    <StatusIcon status={riskConfig.status} size="sm" /> {detection.risk_level?.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${detection.is_resolved ? 'bg-slate-500/20 text-slate-300' : 'bg-blue-500/20 text-blue-300'}`}>
                                                    {detection.is_resolved ? 'RESOLVED' : 'OPEN'}
                                                </span>
                                            </td>
                                        </motion.tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </GlassCard>

            {/* Top Offenders — real */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <GlassCard className="p-6">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                        <Globe className="w-5 h-5 text-blue-400" /> Top Flagged Destinations
                    </h3>
                    <div className="space-y-3">
                        {topDomains.map((domain, idx) => (
                            <motion.div key={domain.name} whileHover={{ x: 4 }}
                                className="p-4 rounded-lg bg-white/3 border border-white/10 hover:border-white/20 transition-all hover:bg-white/5">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <span className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-sm font-bold text-blue-400">{idx + 1}</span>
                                        <span className="text-sm font-medium text-white truncate max-w-[180px]">{domain.name}</span>
                                    </div>
                                    <span className="text-sm font-bold text-blue-400">{domain.count}</span>
                                </div>
                                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/10">
                                    <motion.div initial={{ width: 0 }} animate={{ width: `${domain.percentage}%` }} transition={{ duration: 0.6 }}
                                        className="h-full bg-blue-500/60 rounded-full" />
                                </div>
                                <span className="text-xs text-slate-500 mt-2 inline-block">{domain.percentage}% of sampled traffic</span>
                            </motion.div>
                        ))}
                    </div>
                </GlassCard>

                <GlassCard className="p-6">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                        <Smartphone className="w-5 h-5 text-orange-400" /> Top Offending Devices
                    </h3>
                    <div className="space-y-3">
                        {topDevices.map((device, idx) => (
                            <motion.div key={device.src_ip} whileHover={{ x: 4 }}
                                className="p-4 rounded-lg bg-white/3 border border-white/10 hover:border-white/20 transition-all hover:bg-white/5">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <span className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-sm font-bold text-orange-400">{idx + 1}</span>
                                        <span className="text-sm font-medium text-white font-mono">{device.src_ip}</span>
                                    </div>
                                    <span className="text-sm font-bold text-orange-400">{device.total}</span>
                                </div>
                                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/10 flex">
                                    <div className="h-full bg-red-500/70" style={{ width: `${(device.high_count / device.total) * 100}%` }} />
                                    <div className="h-full bg-amber-500/70" style={{ width: `${(device.medium_count / device.total) * 100}%` }} />
                                    <div className="h-full bg-emerald-500/70" style={{ width: `${(device.low_count / device.total) * 100}%` }} />
                                </div>
                                <span className="text-xs text-slate-500 mt-2 inline-block">{device.open_count} open · last seen {device.last_seen ? formatTimestamp(device.last_seen) : '—'}</span>
                            </motion.div>
                        ))}
                    </div>
                </GlassCard>
            </div>
        </div>
    )
}
