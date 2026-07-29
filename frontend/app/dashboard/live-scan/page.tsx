'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Play, Square, RefreshCw, Radio, Wifi, Search, ShieldAlert, Server, Package, Users, Brain } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import { StatusIcon } from '@/components/ui/StatusIcon'
import { scanApi, wazuhApi, radiusApi, classifierApi, apiErrorMessage } from '@/lib/api'
import { isAdmin } from '@/lib/auth'
import type { ScanStatus, Detection, NetworkInterface, DiscoveredDevice, DiscoverResponse } from '@/lib/types'

const POLL_MS = 5000

// Ports that signal remote access / unauthenticated data stores — highlighted
// red in the discovery results. Mirrors _RISKY_PORTS in ml/collector.py.
const RISKY_PORTS = new Set([23, 3389, 5900, 445, 6379, 9200, 27017, 1433])

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

    // Active network-discovery state (separate from passive capture above)
    const [authorized, setAuthorized] = useState(false)
    const [discovering, setDiscovering] = useState(false)
    const [discoverError, setDiscoverError] = useState('')
    const [discoverInfo, setDiscoverInfo] = useState('')
    const [devices, setDevices] = useState<DiscoveredDevice[]>([])

    // Wazuh software-inventory sync (Syscollector — a software-presence signal,
    // independent of network capture)
    const [wazuhSyncing, setWazuhSyncing] = useState(false)
    const [wazuhError, setWazuhError] = useState('')
    const [wazuhInfo, setWazuhInfo] = useState('')
    const [wazuhDetections, setWazuhDetections] = useState<Detection[]>([])
    type WazuhAgent = { id: string; name: string; ip: string; status: string }
    const [wazuhStatus, setWazuhStatus] = useState<{ connected: boolean; error: string | null; agents: WazuhAgent[] } | null>(null)

    // RADIUS/AAA concurrent-session sync (FreeRADIUS accounting — a network-
    // login identity signal, independent of app-layer JWT sessions)
    const [radiusSyncing, setRadiusSyncing] = useState(false)
    const [radiusError, setRadiusError] = useState('')
    const [radiusInfo, setRadiusInfo] = useState('')
    const [radiusDetections, setRadiusDetections] = useState<Detection[]>([])
    const [radiusStatus, setRadiusStatus] = useState<{ connected: boolean; error: string | null; open_sessions: number; identities: number } | null>(null)

    // Behavioural traffic classifier — status + retrain (enrichment only, no
    // detections/blocking; it fills app_category on anomaly-flagged flows).
    const [clfRetraining, setClfRetraining] = useState(false)
    const [clfError, setClfError] = useState('')
    const [clfInfo, setClfInfo] = useState('')
    const [clfStatus, setClfStatus] = useState<{ trained: boolean; categories: string[]; n_samples: number; accuracy: number | null; trained_at: string | null; min_confidence?: number } | null>(null)

    const selectedIp = interfaces.find((i) => i.device === iface)?.ip || ''
    const subnet = selectedIp ? `${selectedIp.split('.').slice(0, 3).join('.')}.0/24` : ''

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
        wazuhApi.status()
            .then((r) => setWazuhStatus(r.data))
            .catch((e) => setWazuhStatus({ connected: false, error: apiErrorMessage(e, 'Could not reach Wazuh manager'), agents: [] }))
        radiusApi.status()
            .then((r) => setRadiusStatus(r.data))
            .catch((e) => setRadiusStatus({ connected: false, error: apiErrorMessage(e, 'Could not reach RADIUS accounting'), open_sessions: 0, identities: 0 }))
        classifierApi.status()
            .then((r) => setClfStatus(r.data))
            .catch(() => setClfStatus(null))
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

    const handleDiscover = async () => {
        if (!selectedIp || !authorized) return
        setDiscovering(true); setDiscoverError(''); setDiscoverInfo('')
        try {
            const r = await scanApi.discover(selectedIp, authorized)
            const data: DiscoverResponse = r.data
            setDevices(data.devices)
            const s = (n: number) => (n === 1 ? '' : 's')
            setDiscoverInfo(
                `${data.device_count} device${s(data.device_count)} · ` +
                `${data.service_count} service${s(data.service_count)} · ` +
                `${data.saved} saved to Detections`
            )
        } catch (e) {
            setDiscoverError(apiErrorMessage(e, 'Network scan failed'))
        } finally { setDiscovering(false) }
    }

    const handleWazuhSync = async () => {
        setWazuhSyncing(true); setWazuhError(''); setWazuhInfo('')
        try {
            const r = await wazuhApi.sync()
            setWazuhDetections(r.data.detections || [])
            const s = (n: number) => (n === 1 ? '' : 's')
            setWazuhInfo(
                `${r.data.agents_scanned} agent${s(r.data.agents_scanned)} scanned · ` +
                `${r.data.detections_saved} unsanctioned software detection${s(r.data.detections_saved)} saved`
            )
            if (r.data.errors?.length) setWazuhError(r.data.errors.join('; '))
        } catch (e) {
            setWazuhError(apiErrorMessage(e, 'Wazuh sync failed'))
        } finally {
            setWazuhSyncing(false)
            wazuhApi.status().then((r) => setWazuhStatus(r.data)).catch(() => {})
        }
    }

    const handleClassifierRetrain = async () => {
        setClfRetraining(true); setClfError(''); setClfInfo('')
        try {
            const r = await classifierApi.retrain()
            if (r.data.trained === false) {
                setClfError(r.data.error || 'Not enough samples to train yet.')
            } else {
                const acc = r.data.accuracy != null ? `${(r.data.accuracy * 100).toFixed(1)}% holdout accuracy` : ''
                setClfInfo(`Retrained on ${r.data.n_samples} samples · ${acc}`)
            }
        } catch (e) {
            setClfError(apiErrorMessage(e, 'Retrain failed'))
        } finally {
            setClfRetraining(false)
            classifierApi.status().then((r) => setClfStatus(r.data)).catch(() => {})
        }
    }

    const handleRadiusSync = async () => {
        setRadiusSyncing(true); setRadiusError(''); setRadiusInfo('')
        try {
            const r = await radiusApi.sync()
            setRadiusDetections(r.data.detections || [])
            const n = r.data.detections_saved
            setRadiusInfo(n === 0
                ? 'No concurrent RADIUS sessions found — every identity is logged in from one location only.'
                : `${n} concurrent-session detection${n === 1 ? '' : 's'} saved`)
        } catch (e) {
            setRadiusError(apiErrorMessage(e, 'RADIUS sync failed'))
        } finally {
            setRadiusSyncing(false)
            radiusApi.status().then((r) => setRadiusStatus(r.data)).catch(() => {})
        }
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
                                    This interface has no IP address — it&apos;s probably a virtual/inactive adapter and won&apos;t see real traffic. Pick one with an IP shown.
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
                        <StatBox label="Packets Seen" value={status.packets_seen ?? 0} color="var(--accent-primary)" />
                        <StatBox label="Flows Analysed" value={status.flows_analysed ?? 0} color="#6b7a78" />
                        <StatBox label="Active Flows" value={status.active_flows ?? 0} color="#9aa7a5" />
                        <StatBox label="Anomalies Found" value={status.detections_found ?? detections.length} color="#1c2624" />
                        <StatBox label="Uptime" value={fmtUptime(status.uptime_s)} color="#22c55e" />
                    </div>
                </GlassCard>
            </div>

            {/* ── Active network discovery (ARP sweep + service port scan) ── */}
            <GlassCard className="p-6">
                <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
                    <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <Search className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            Network Discovery
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide bg-amber-500/10 border border-amber-500/25 text-amber-500">ACTIVE</span>
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-xl leading-relaxed">
                            ARP-sweeps {subnet || 'the selected adapter’s subnet'} to find every device, then probes each for open services (SSH, RDP, SMB, databases…). Unlike passive capture, this <strong>sends packets to every device</strong> — findings are saved to Detections.
                        </p>
                    </div>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        onClick={handleDiscover} disabled={!authorized || !selectedIp || discovering}
                        className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        <Search className="w-4 h-4" /> {discovering ? 'Scanning…' : 'Scan Network'}
                    </motion.button>
                </div>

                <label className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 cursor-pointer">
                    <input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)}
                        className="mt-0.5 accent-amber-500" />
                    <span className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed flex items-start gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                        I am authorized to actively scan this network. Probing devices on a network you don’t own or have permission to test may violate acceptable-use policy or law.
                    </span>
                </label>

                {!selectedIp && (
                    <p className="text-xs text-amber-500 mt-3">Select a capture interface with an IP address (above) to scan its subnet.</p>
                )}
                {discoverError && <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-400">{discoverError}</div>}
                {discoverInfo && <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-sm text-emerald-500">{discoverInfo}</div>}

                {devices.length > 0 && (
                    <div className="overflow-x-auto mt-4">
                        <table className="w-full text-sm">
                            <thead className="border-b border-slate-200 dark:border-white/10">
                                <tr className="text-xs text-slate-900 dark:text-slate-500 font-medium">
                                    <th className="text-left py-2 px-3">Device IP</th>
                                    <th className="text-left py-2 px-3">MAC</th>
                                    <th className="text-left py-2 px-3">Device Type</th>
                                    <th className="text-left py-2 px-3">Open Services</th>
                                </tr>
                            </thead>
                            <tbody>
                                {devices.map((d) => (
                                    <tr key={d.ip} className="border-b border-slate-100 dark:border-white/5 align-top">
                                        <td className="py-2.5 px-3 text-xs font-mono text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                            <Server className="w-3.5 h-3.5 text-slate-400" /> {d.ip}
                                        </td>
                                        <td className="py-2.5 px-3 text-xs font-mono text-slate-500">{d.mac}</td>
                                        <td className="py-2.5 px-3 text-xs text-slate-600 dark:text-slate-400">
                                            {d.device_type || <span className="text-slate-400">unknown</span>}
                                        </td>
                                        <td className="py-2.5 px-3">
                                            {d.services.length === 0 ? (
                                                <span className="text-xs text-slate-400">no common ports open</span>
                                            ) : (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {d.services.map((s) => {
                                                        const risky = RISKY_PORTS.has(s.port)
                                                        return (
                                                            <span key={s.port}
                                                                className={`px-2 py-0.5 rounded text-[11px] font-medium border ${risky ? 'bg-red-500/10 border-red-500/25 text-red-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
                                                                {s.service}:{s.port}
                                                            </span>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </GlassCard>

            {/* ── Wazuh software-inventory sync (Syscollector) ── */}
            <GlassCard className="p-6">
                <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
                    <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            Wazuh Software Inventory
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide bg-emerald-500/10 border border-emerald-500/25 text-emerald-500">SYSCOLLECTOR</span>
                            {wazuhStatus == null ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-500/10 border border-slate-500/25 text-slate-400">checking…</span>
                            ) : wazuhStatus.connected ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/25 text-emerald-500">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    {wazuhStatus.agents.filter((a) => a.status === 'active').length}/{wazuhStatus.agents.length} agents connected
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 border border-red-500/25 text-red-400">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> manager unreachable
                                </span>
                            )}
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-xl leading-relaxed">
                            Pulls installed-software inventory from every connected Wazuh agent and flags anything matching the unsanctioned SaaS catalog by app name (e.g. TeamViewer, AnyDesk, Dropbox) — a software-presence signal that doesn&apos;t depend on catching the app&apos;s traffic in a capture window.
                        </p>
                        {wazuhStatus && wazuhStatus.connected && wazuhStatus.agents.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {wazuhStatus.agents.map((a) => (
                                    <span key={a.id} className={`px-2 py-0.5 rounded text-[11px] font-mono border ${a.status === 'active' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-500' : 'bg-red-500/10 border-red-500/25 text-red-400'}`}>
                                        {a.name} ({a.ip}) — {a.status}
                                    </span>
                                ))}
                            </div>
                        )}
                        {wazuhStatus && !wazuhStatus.connected && wazuhStatus.error && (
                            <p className="text-xs text-red-400 mt-2">{wazuhStatus.error}</p>
                        )}
                    </div>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        onClick={handleWazuhSync} disabled={wazuhSyncing}
                        className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50">
                        <RefreshCw className="w-4 h-4" /> {wazuhSyncing ? 'Syncing…' : 'Sync Inventory'}
                    </motion.button>
                </div>

                {wazuhError && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-400">{wazuhError}</div>}
                {wazuhInfo && <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-sm text-emerald-500">{wazuhInfo}</div>}

                {wazuhDetections.length > 0 && (
                    <div className="overflow-x-auto mt-4">
                        <table className="w-full text-sm">
                            <thead className="border-b border-slate-200 dark:border-white/10">
                                <tr className="text-xs text-slate-900 dark:text-slate-500 font-medium">
                                    <th className="text-left py-2 px-3">Agent</th>
                                    <th className="text-left py-2 px-3">IP</th>
                                    <th className="text-left py-2 px-3">Installed Software</th>
                                    <th className="text-left py-2 px-3">Category</th>
                                    <th className="text-left py-2 px-3">Risk</th>
                                </tr>
                            </thead>
                            <tbody>
                                {wazuhDetections.map((d, i) => {
                                    const rc = getRiskColor(d.risk_level)
                                    return (
                                        <tr key={i} className="border-b border-slate-100 dark:border-white/5">
                                            <td className="py-2.5 px-3 text-xs text-slate-700 dark:text-slate-300">{d.device_type}</td>
                                            <td className="py-2.5 px-3 text-xs font-mono text-slate-500">{d.src_ip}</td>
                                            <td className="py-2.5 px-3 text-xs text-slate-700 dark:text-slate-300">{d.dst_domain}</td>
                                            <td className="py-2.5 px-3 text-xs text-slate-500">{d.app_category || '—'}</td>
                                            <td className="py-2.5 px-3">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${rc.bg} border ${rc.border}`}>
                                                    <StatusIcon status={rc.status} size="sm" /> {d.risk_level?.toUpperCase()}
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </GlassCard>

            {/* ── RADIUS/AAA concurrent-session sync (FreeRADIUS accounting) ── */}
            <GlassCard className="p-6">
                <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
                    <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <Users className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                            RADIUS/AAA Concurrent Sessions
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide bg-cyan-500/10 border border-cyan-500/25 text-cyan-500">FREERADIUS</span>
                            {radiusStatus == null ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-500/10 border border-slate-500/25 text-slate-400">checking…</span>
                            ) : radiusStatus.connected ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/25 text-emerald-500">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    {radiusStatus.open_sessions} open session{radiusStatus.open_sessions === 1 ? '' : 's'} · {radiusStatus.identities} identit{radiusStatus.identities === 1 ? 'y' : 'ies'}
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 border border-red-500/25 text-red-400">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> accounting table unreachable
                                </span>
                            )}
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-xl leading-relaxed">
                            Reads FreeRADIUS accounting (radacct) for identities logged in from more than one NAS location at once — the same concurrent-session concept as the app-layer feature, sourced from network-level RADIUS logins (Wi-Fi/VPN/802.1X) instead of dashboard sessions. FreeRADIUS&apos;s own Simultaneous-Use check already blocks this in real time; this is the audit-trail view.
                        </p>
                        {radiusStatus && !radiusStatus.connected && radiusStatus.error && (
                            <p className="text-xs text-red-400 mt-2">{radiusStatus.error}</p>
                        )}
                    </div>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        onClick={handleRadiusSync} disabled={radiusSyncing}
                        className="px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50">
                        <RefreshCw className="w-4 h-4" /> {radiusSyncing ? 'Syncing…' : 'Sync Sessions'}
                    </motion.button>
                </div>

                {radiusError && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-400">{radiusError}</div>}
                {radiusInfo && <div className="mt-3 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/25 text-sm text-cyan-500">{radiusInfo}</div>}

                {radiusDetections.length > 0 && (
                    <div className="overflow-x-auto mt-4">
                        <table className="w-full text-sm">
                            <thead className="border-b border-slate-200 dark:border-white/10">
                                <tr className="text-xs text-slate-900 dark:text-slate-500 font-medium">
                                    <th className="text-left py-2 px-3">Identity</th>
                                    <th className="text-left py-2 px-3">First NAS IP</th>
                                    <th className="text-left py-2 px-3">Detail</th>
                                    <th className="text-left py-2 px-3">Risk</th>
                                </tr>
                            </thead>
                            <tbody>
                                {radiusDetections.map((d, i) => {
                                    const rc = getRiskColor(d.risk_level)
                                    return (
                                        <tr key={i} className="border-b border-slate-100 dark:border-white/5">
                                            <td className="py-2.5 px-3 text-xs text-slate-700 dark:text-slate-300">{d.device_type}</td>
                                            <td className="py-2.5 px-3 text-xs font-mono text-slate-500">{d.src_ip}</td>
                                            <td className="py-2.5 px-3 text-xs text-slate-700 dark:text-slate-300">{d.dst_domain}</td>
                                            <td className="py-2.5 px-3">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${rc.bg} border ${rc.border}`}>
                                                    <StatusIcon status={rc.status} size="sm" /> {d.risk_level?.toUpperCase()}
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </GlassCard>

            {/* ── Behavioural traffic classifier (ML app-category enrichment) ── */}
            <GlassCard className="p-6">
                <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
                    <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <Brain className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                            Behavioural Traffic Classifier
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide bg-violet-500/10 border border-violet-500/25 text-violet-500">RANDOM FOREST</span>
                            {clfStatus == null ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-500/10 border border-slate-500/25 text-slate-400">checking…</span>
                            ) : clfStatus.trained ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-violet-500/10 border border-violet-500/25 text-violet-500">
                                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                                    trained{clfStatus.accuracy != null ? ` · ${(clfStatus.accuracy * 100).toFixed(0)}% acc` : ''}
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 border border-amber-500/25 text-amber-500">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> not trained yet
                                </span>
                            )}
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-xl leading-relaxed">
                            Predicts an app category (file-sharing, remote-access, AI, …) from a flow&apos;s behaviour when the destination can&apos;t be named — enriching anomaly-flagged flows with a &ldquo;look-alike&rdquo; category. Learns from bank-net traffic captured during live scans; retrain to fold in new samples.
                        </p>
                        {clfStatus && clfStatus.trained && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                <span className="px-2 py-0.5 rounded text-[11px] font-mono border bg-slate-500/10 border-slate-500/25 text-slate-400">{clfStatus.n_samples} samples</span>
                                {clfStatus.categories.map((c) => (
                                    <span key={c} className="px-2 py-0.5 rounded text-[11px] font-mono border bg-violet-500/10 border-violet-500/25 text-violet-500">{c}</span>
                                ))}
                                {clfStatus.trained_at && <span className="px-2 py-0.5 rounded text-[11px] font-mono border bg-slate-500/10 border-slate-500/25 text-slate-400">trained {clfStatus.trained_at.replace('T', ' ')}</span>}
                            </div>
                        )}
                        {clfStatus && !clfStatus.trained && (
                            <p className="text-xs text-amber-500 mt-2">Run a bank-net live scan so named flows are recorded, then retrain.</p>
                        )}
                    </div>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        onClick={handleClassifierRetrain} disabled={clfRetraining}
                        className="px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50">
                        <RefreshCw className="w-4 h-4" /> {clfRetraining ? 'Retraining…' : 'Retrain'}
                    </motion.button>
                </div>
                {clfError && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-400">{clfError}</div>}
                {clfInfo && <div className="mt-3 p-3 rounded-lg bg-violet-500/10 border border-violet-500/25 text-sm text-violet-500">{clfInfo}</div>}
            </GlassCard>

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
                                        <th className="text-left py-2 px-3">Device Type</th>
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
                                                <td className="py-2 px-3 text-xs text-slate-600 dark:text-slate-400">{d.device_type && d.device_type !== 'unknown' ? d.device_type : <span className="text-slate-400">unknown</span>}</td>
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
