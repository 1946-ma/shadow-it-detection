'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import GlassCard from '@/components/ui/GlassCard'
import AnimatedCounter from '@/components/ui/AnimatedCounter'
import { StatusIcon } from '@/components/ui/StatusIcon'
import { Monitor, AlertCircle, Loader2 } from 'lucide-react'
import { fetchAllDetections, groupByDevice, type DeviceAggregate } from '@/lib/aggregate'

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

export default function DevicesPage() {
    const [devices, setDevices] = useState<DeviceAggregate[]>([])
    const [scanned, setScanned] = useState(0)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        (async () => {
            setLoading(true)
            try {
                const { rows } = await fetchAllDetections(500)
                setDevices(groupByDevice(rows))
                setScanned(rows.length)
            } catch (err) {
                console.error(err)
            } finally {
                setLoading(false)
            }
        })()
    }, [])

    const stats = {
        total: devices.length,
        highRisk: devices.filter((d) => d.risk === 'high').length,
        totalDetections: devices.reduce((s, d) => s + d.count, 0),
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                    { label: 'Distinct Devices', value: stats.total, icon: Monitor, color: 'blue' as const },
                    { label: 'High Risk Devices', value: stats.highRisk, status: 'high' as const, color: null },
                    { label: 'Detections Sampled', value: stats.totalDetections, icon: AlertCircle, color: 'orange' as const },
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

            <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Device Inventory</h3>
                        <p className="text-xs text-slate-700 dark:text-slate-500 mt-1">Aggregated from up to {scanned.toLocaleString()} recent detections, grouped by source IP/MAC</p>
                    </div>
                    <span className="text-xs text-slate-500">{devices.length} device{devices.length !== 1 ? 's' : ''}</span>
                </div>

                {loading ? (
                    <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-400" /></div>
                ) : devices.length === 0 ? (
                    <div className="text-center py-12"><p className="text-slate-600 dark:text-slate-500">No devices observed yet</p></div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-slate-200 dark:border-white/10">
                                <tr className="text-xs text-slate-900 dark:text-slate-500 font-medium">
                                    <th className="text-left py-3 px-4">Source IP</th>
                                    <th className="text-left py-3 px-4">MAC Address</th>
                                    <th className="text-left py-3 px-4">Device Type</th>
                                    <th className="text-left py-3 px-4">Detections</th>
                                    <th className="text-left py-3 px-4">Highest Risk</th>
                                    <th className="text-left py-3 px-4">Last Seen</th>
                                </tr>
                            </thead>
                            <tbody>
                                {devices.map((device) => {
                                    const riskConfig = getRiskColor(device.risk)
                                    return (
                                        <motion.tr key={device.src_ip || device.src_mac} whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                                            className="border-b border-slate-200 dark:border-white/5">
                                            <td className="py-3 px-4 text-xs font-mono text-slate-700 dark:text-slate-300">{device.src_ip || '—'}</td>
                                            <td className="py-3 px-4 text-xs font-mono text-slate-500 dark:text-slate-400">{device.src_mac || '—'}</td>
                                            <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400 capitalize">{device.device_type || '—'}</td>
                                            <td className="py-3 px-4 text-xs text-blue-400 font-medium">{device.count}</td>
                                            <td className="py-3 px-4">
                                                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${riskConfig.bg} border ${riskConfig.border}`}>
                                                    <StatusIcon status={riskConfig.status} size="sm" /> {device.risk.toUpperCase()}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-xs text-slate-500">{formatLastSeen(device.lastSeen)}</td>
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
