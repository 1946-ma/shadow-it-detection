'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Play, Square, RefreshCw, Radio, Wifi } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import { StatusIcon } from '@/components/ui/StatusIcon'
import { scanApi, apiErrorMessage } from '@/lib/api'
import { isAdmin } from '@/lib/auth'
import type { ScanStatus, Detection, NetworkInterface } from '@/lib/types'

const POLL_MS = 5000

const StatBox = ({ label, value, color }: { label: string; value: string | number; color: string }) => (
    <div className="flex-1 min-w-[90px] rounded-xl p-3.5 text-center bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
        <div className="text-xl font-bold tracking-tight" style={{ color }}>{value}</div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-500 font-medium mt-1">{label}</div>
    </div>
)

const getRiskColor = (risk: string | null) => {
    switch (risk) {
        case 'high': return { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', status: 'high' as const }
        case 'medium': return { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', status: 'medium' as const }
        default: return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', status: 'low' as const }
    }
}

const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString() : '—')

const fmtUptime = (s: number) => {
    if (!s) return '0s'
    const sec = Math.floor(s)
    if (sec < 60) return `${sec}s`
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
    return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

export default function LiveScanPage() {
    const router = useRouter()
    useEffect(() => { if (!isAdmin()) router.push('/dashboard') }, [router])

    const [interfaces, setInterfaces] = useState<NetworkInterface[]>([])
    const [iface, setIface] = useState('')
    const [status, setStatus] = useState<ScanStatus>({
        running: false, packets_seen: 0, flows_analysed: 0, active_flows: 0, detections_found: 0, uptime_s: 0, errors: [],
    })
    const [detections, setDetections] = useState<(Detection & { _ts: string })[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [ifaceErr, setIfaceErr] = useState('')
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
        scanApi.interfaces()
            .then((r) => {
                const list: NetworkInterface[] = r.data.interfaces || []
                setInterfaces(list)
                // Sorted server-side with real, routable adapters first — default to that one.
                if (list.length) setIface(list[0].device)
            })
            .catch((e) => setIfaceErr(e.response?.data?.error || 'Could not list interfaces'))
        scanApi.status().then((r) => setStatus(r.data)).catch(() => {})
    }, [])

    const poll = useCallback(async () => {
        try {
            const [st, det] = await Promise.all([scanApi.status(), scanApi.detections()])
            setStatus(st.data)
            if (det.data.count > 0) {
                setDetections((prev) =>
                    [...det.data.detections.map((d: Detection) => ({ ...d, _ts: new Date().toISOString() })), ...prev].slice(0, 200)
                )
            }
        } catch { /* transient poll failure, retried on next interval */ }
    }, [])

    useEffect(() => {
        if (status.running) {
            pollRef.current = setInterval(poll, POLL_MS)
        } else if (pollRef.current) {
            clearInterval(pollRef.current)
        }
        return () => { if (pollRef.current) clearInterval(pollRef.current) }
    }, [status.running, poll])

    const handleStart = async () => {
        setLoading(true); setError('')
        try {
            const r = await scanApi.start(iface || undefined)
            setStatus(r.data.status)
        } catch (e) {
            setError(apiErrorMessage(e, 'Failed to start scan'))
        } finally { setLoading(false) }
    }

    const handleStop = async () => {
        setLoading(true); setError('')
        try {
            const r = await scanApi.stop()
            setStatus(r.data.status || { ...status, running: false })
        } catch (e) {
            setError(apiErrorMessage(e, 'Failed to stop scan'))
        } finally { setLoading(false) }
    }

    const handleFlush = async () => {
        setLoading(true); setError('')
        try {
            await scanApi.flush()
            await poll()
        } catch (e) {
            setError(apiErrorMessage(e, 'Flush failed'))
        } finally { setLoading(false) }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <Wifi className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                        Live Network Scan
                        {status.running && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold tracking-wide bg-red-500/10 border border-red-500/25 text-red-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> CAPTURING
                            </span>
                        )}
                    </h1>
                    <p className="text-sm text-slate-700 dark:text-slate-400 mt-1">Real-time packet capture · IsolationForest anomaly detection</p>
                </div>
                <div className="flex items-center gap-2">
                    {status.running && (
                        <button onClick={handleFlush} disabled={loading} title="Force-analyse all active flows right now"
                            className="px-4 py-2.5 rounded-lg bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-white/10 border border-slate-300 dark:border-white/10 transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50">
                            <RefreshCw className="w-4 h-4" /> Analyze Now
                        </button>
                    )}
                    {!status.running ? (
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleStart} disabled={loading}
                            className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50">
                            <Play className="w-4 h-4" /> {loading ? 'Starting…' : 'Start Scan'}
                        </motion.button>
                    ) : (
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleStop} disabled={loading}
                            className="px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50">
                            <Square className="w-4 h-4" /> {loading ? 'Stopping…' : 'Stop Scan'}
                        </motion.button>
                    )}
                </div>
            </div>

            {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-400">{error}</div>}
            {ifaceErr && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-400">{ifaceErr} — is Npcap installed?</div>}
            {status.errors?.length > 0 && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-400">
                    Capture error: {status.errors[status.errors.length - 1]}
                    {status.errors[0]?.includes('permission') && ' — run Flask as Administrator'}
                </div>
            )}
            {status.running && status.packets_seen === 0 && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-sm text-amber-400">
                    No packets captured yet — try a different interface from the dropdown, then stop and restart the scan.
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4">
                <GlassCard className="p-6">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Capture Interface</h3>
                    {interfaces.length > 0 ? (
                        <>
                            <select value={iface} onChange={(e) => setIface(e.target.value)} disabled={status.running}
                                className="w-full px-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-60">
                                {interfaces.map((i) => (
                                    <option key={i.device} value={i.device}>
                                        {i.description}{i.ip ? ` — ${i.ip}` : ' (no IP — likely inactive)'}
                                    </option>
                                ))}
                            </select>
                            {!interfaces.find((i) => i.device === iface)?.ip && (
                                <p className="text-xs text-amber-500 mt-2">
                                    This interface has no IP address — it's probably a virtual/inactive adapter and won't see real traffic. Pick one with an IP shown.
                                </p>
                            )}
                        </>
                    ) : (
                        <p className="text-xs text-slate-500 dark:text-slate-500">No interfaces found — install Npcap and restart Flask as Administrator.</p>
                    )}
                    <p className="text-xs text-slate-500 dark:text-slate-500 mt-3 leading-relaxed">
                        Flows are analysed every 10s after 30s of inactivity. Anomalous flows are saved to Detections.
                    </p>
                </GlassCard>

                <GlassCard className="p-6">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                        {status.running ? <><Radio className="w-3.5 h-3.5 text-red-400" /> Live Stats</> : 'Last Session Stats'}
                    </h3>
                    <div className="flex gap-2.5 flex-wrap">
                        <StatBox label="Packets Seen" value={status.packets_seen ?? 0} color="#3b82f6" />
                        <StatBox label="Flows Analysed" value={status.flows_analysed ?? 0} color="#8b5cf6" />
                        <StatBox label="Active Flows" value={status.active_flows ?? 0} color="#f59e0b" />
                        <StatBox label="Anomalies Found" value={status.detections_found ?? detections.length} color="#ef4444" />
                        <StatBox label="Uptime" value={fmtUptime(status.uptime_s)} color="#22c55e" />
                    </div>
                </GlassCard>
            </div>

            {!status.running && detections.length === 0 && (
                <GlassCard className="p-6">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">How Live Detection Works</h3>
                    <div className="space-y-4">
                        {[
                            { n: 1, t: 'Packet Capture', d: 'Scapy captures every IP packet on the selected interface in real time.' },
                            { n: 2, t: 'Flow Assembly', d: 'Packets are grouped into bidirectional flows by (src IP, dst IP, src port, dst port, protocol). Each flow accumulates until 30s of silence.' },
                            { n: 3, t: 'Feature Extraction', d: '20 statistical features are computed per flow — the same features used in CICIDS2017 training data.' },
                            { n: 4, t: 'IsolationForest Scoring', d: 'The trained model scores each flow. Flows it cannot explain as "normal" are flagged as anomalies and saved to Detections.' },
                        ].map((step) => (
                            <div key={step.n} className="flex gap-3.5 items-start">
                                <div className="flex-shrink-0 w-6.5 h-6.5 w-[26px] h-[26px] rounded-full bg-blue-500/12 border border-blue-500/25 text-blue-500 text-xs font-bold flex items-center justify-center">{step.n}</div>
                                <div>
                                    <strong className="block text-slate-900 dark:text-white text-sm mb-0.5">{step.t}</strong>
                                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{step.d}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </GlassCard>
            )}

            {(status.running || detections.length > 0) && (
                <GlassCard className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            {status.running ? <><Radio className="w-3.5 h-3.5 text-red-400" /> Live Anomalies</> : 'Captured Anomalies'}
                        </h3>
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded px-2 py-0.5">{detections.length} flagged</span>
                            {detections.length > 0 && (
                                <button onClick={() => setDetections([])} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1">
                                    <RefreshCw className="w-3 h-3" /> Clear
                                </button>
                            )}
                        </div>
                    </div>

                    {detections.length === 0 ? (
                        <div className="text-center py-10"><p className="text-slate-600 dark:text-slate-500 text-sm">Waiting for anomalies…</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="border-b border-slate-200 dark:border-white/10">
                                    <tr className="text-xs text-slate-900 dark:text-slate-500 font-medium">
                                        <th className="text-left py-2 px-3">Time</th>
                                        <th className="text-left py-2 px-3">Source IP</th>
                                        <th className="text-left py-2 px-3">Destination</th>
                                        <th className="text-left py-2 px-3">Protocol</th>
                                        <th className="text-left py-2 px-3">Type</th>
                                        <th className="text-left py-2 px-3">Risk</th>
                                        <th className="text-left py-2 px-3">Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {detections.map((d, i) => {
                                        const rc = getRiskColor(d.risk_level)
                                        return (
                                            <tr key={i} className="border-b border-slate-100 dark:border-white/5">
                                                <td className="py-2 px-3 text-xs text-slate-500">{fmtTime(d._ts)}</td>
                                                <td className="py-2 px-3 text-xs font-mono text-slate-700 dark:text-slate-300">{d.src_ip}</td>
                                                <td className="py-2 px-3 text-xs text-slate-700 dark:text-slate-300 max-w-[160px] truncate">{d.dst_domain || '—'}</td>
                                                <td className="py-2 px-3 text-xs text-slate-500">{d.protocol || '—'}</td>
                                                <td className="py-2 px-3 text-xs"><span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-400">{d.shadow_it_type || '—'}</span></td>
                                                <td className="py-2 px-3">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${rc.bg} border ${rc.border}`}>
                                                        <StatusIcon status={rc.status} size="sm" /> {d.risk_level?.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-3 text-xs font-mono text-amber-400">{d.anomaly_score != null ? d.anomaly_score.toFixed(4) : '—'}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </GlassCard>
            )}
        </div>
    )
}
