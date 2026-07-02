'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useIsDark, chartTooltipStyles } from '@/lib/useIsDark'
import GlassCard from '@/components/ui/GlassCard'
import AnimatedCounter from '@/components/ui/AnimatedCounter'
import { StatusIcon } from '@/components/ui/StatusIcon'
import { Package, AlertTriangle, Loader2 } from 'lucide-react'
import { fetchAllDetections, groupByApplication, type ApplicationAggregate } from '@/lib/aggregate'

const TYPE_COLORS: Record<string, string> = {
    software: '#3b82f6',
    hardware: '#a855f7',
    mixed: '#f59e0b',
}

const getRiskColor = (risk: string) => {
    switch (risk) {
        case 'high': return { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', status: 'high' as const }
        case 'medium': return { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', status: 'medium' as const }
        default: return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', status: 'low' as const }
    }
}

function formatLastSeen(iso: string | null) {
    if (!iso) return '—'
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
}

export default function ApplicationsPage() {
    const isDark = useIsDark()
    const tt = chartTooltipStyles(isDark)
    const [apps, setApps] = useState<ApplicationAggregate[]>([])
    const [scanned, setScanned] = useState(0)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        (async () => {
            setLoading(true)
            try {
                const { rows } = await fetchAllDetections(500)
                setApps(groupByApplication(rows))
                setScanned(rows.length)
            } catch (err) {
                console.error(err)
            } finally {
                setLoading(false)
            }
        })()
    }, [])

    const stats = {
        total: apps.length,
        highRisk: apps.filter((a) => a.risk === 'high').length,
        totalDetections: apps.reduce((s, a) => s + a.count, 0),
    }

    const typeData = Object.entries(
        apps.reduce<Record<string, number>>((acc, a) => {
            const key = a.shadow_it_type || 'unknown'
            acc[key] = (acc[key] ?? 0) + a.count
            return acc
        }, {})
    ).map(([name, value]) => ({ name, value }))

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                    { label: 'Distinct Destinations', value: stats.total, icon: Package, color: 'blue' as const },
                    { label: 'High Risk', value: stats.highRisk, status: 'high' as const, color: null },
                    { label: 'Detections Sampled', value: stats.totalDetections, icon: AlertTriangle, color: 'orange' as const },
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

            {typeData.length > 0 && (
                <GlassCard className="p-6">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">Shadow IT Type Breakdown</h3>
                    <div className="flex flex-col md:flex-row items-center gap-8">
                        <div className="flex-shrink-0 w-[200px] h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={typeData} cx="50%" cy="50%" innerRadius={55} outerRadius={88} paddingAngle={3} dataKey="value" stroke="none">
                                        {typeData.map((entry) => (
                                            <Cell key={entry.name} fill={TYPE_COLORS[entry.name] ?? '#64748b'} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={tt.contentStyle} labelStyle={tt.labelStyle} itemStyle={tt.itemStyle}
                                        formatter={(value: number, name: string) => [`${value} detections`, name]} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 w-full">
                            {typeData.map(({ name, value }) => {
                                const color = TYPE_COLORS[name] ?? '#64748b'
                                return (
                                    <div key={name} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: `${color}18`, border: `1px solid ${color}40` }}>
                                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-slate-900 dark:text-white truncate capitalize">{name}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">{value} detections</p>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </GlassCard>
            )}

            <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Application / Destination Inventory</h3>
                        <p className="text-xs text-slate-700 dark:text-slate-500 mt-1">Aggregated from up to {scanned.toLocaleString()} recent detections, grouped by destination</p>
                    </div>
                    <span className="text-xs text-slate-500">{apps.length} destination{apps.length !== 1 ? 's' : ''}</span>
                </div>

                {loading ? (
                    <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-400" /></div>
                ) : apps.length === 0 ? (
                    <div className="text-center py-12"><p className="text-slate-900 dark:text-slate-500">No applications observed yet</p></div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-slate-200 dark:border-white/10">
                                <tr className="text-xs text-slate-900 dark:text-slate-500 font-medium">
                                    <th className="text-left py-3 px-4">Destination</th>
                                    <th className="text-left py-3 px-4">Type</th>
                                    <th className="text-left py-3 px-4">Detections</th>
                                    <th className="text-left py-3 px-4">Highest Risk</th>
                                    <th className="text-left py-3 px-4">Last Seen</th>
                                </tr>
                            </thead>
                            <tbody>
                                {apps.map((app) => {
                                    const riskConfig = getRiskColor(app.risk)
                                    return (
                                        <motion.tr key={app.dst_domain} whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                                            className="border-b border-slate-200 dark:border-white/5">
                                            <td className="py-3 px-4 text-xs font-medium text-slate-900 dark:text-white max-w-[220px] truncate">{app.dst_domain}</td>
                                            <td className="py-3 px-4 text-xs">
                                                <span
                                                    className="px-2 py-1 rounded text-xs font-medium capitalize"
                                                    style={{
                                                        background: `${TYPE_COLORS[app.shadow_it_type ?? ''] ?? '#64748b'}20`,
                                                        color: TYPE_COLORS[app.shadow_it_type ?? ''] ?? '#94a3b8',
                                                        border: `1px solid ${TYPE_COLORS[app.shadow_it_type ?? ''] ?? '#64748b'}40`,
                                                    }}
                                                >
                                                    {app.shadow_it_type ?? 'unknown'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-xs text-blue-400 font-medium">{app.count}</td>
                                            <td className="py-3 px-4">
                                                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${riskConfig.bg} border ${riskConfig.border}`}>
                                                    <StatusIcon status={riskConfig.status} size="sm" /> {app.risk.toUpperCase()}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-xs text-slate-500">{formatLastSeen(app.lastSeen)}</td>
                                        </motion.tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </GlassCard>
        </div>
    )
}
