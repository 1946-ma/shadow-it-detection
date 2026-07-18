'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
    Sparkles, Play, Download, Loader2, ArrowUpRight, ShieldAlert,
    Smartphone, BarChart3, Wifi, AlertCircle, Monitor, Package,
    FileText, Code2, Cpu, ChevronDown,
} from 'lucide-react'
import { statsApi, detectionsApi, reportApi, apiErrorMessage } from '@/lib/api'
import { fetchAllDetections, groupByApplication } from '@/lib/aggregate'
import { isAdmin } from '@/lib/auth'
import type { DashboardSummary, TimelinePoint, TopOffender } from '@/lib/types'

const WK = {
    navy: '#14201f', indigo: '#2a7477', coral: '#ff5a6e', gold: '#9aa7a5',
    pink: '#e2e6e4', peri: '#7fb0b2', ink: '#14201f', muted: '#7c8b89',
    line: '#e6e9e8', canvas: '#f5f6f6', white: '#ffffff',
}

const TABS = ['Timeline', 'Risk', 'Types', 'Top Domains', 'Top Devices'] as const
type Tab = typeof TABS[number]

function fmtTs(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function DashboardPage() {
    const router = useRouter()
    const admin = isAdmin()

    const [summary, setSummary]   = useState<DashboardSummary | null>(null)
    const [timeline, setTimeline] = useState<TimelinePoint[]>([])
    const [topDevices, setTopDevices] = useState<TopOffender[]>([])
    const [topDomains, setTopDomains] = useState<{ name: string; count: number; percentage: number }[]>([])
    const [loading, setLoading]   = useState(true)
    const [days, setDays]         = useState<7 | 30>(7)
    const [tab, setTab]           = useState<Tab>('Timeline')
    const [running, setRunning]   = useState(false)
    const [exporting, setExporting] = useState(false)
    const [actionMsg, setActionMsg] = useState('')

    const fetchData = useCallback(async () => {
        try {
            const [statsRes, timelineRes, offendersRes] = await Promise.all([
                statsApi.get(), statsApi.timeline(days), statsApi.topOffenders(5),
            ])
            setSummary(statsRes.data)
            setTimeline(timelineRes.data)
            setTopDevices(offendersRes.data)
            const { rows } = await fetchAllDetections(300)
            const apps = groupByApplication(rows)
            const totalApp = apps.reduce((s, a) => s + a.count, 0) || 1
            setTopDomains(apps.slice(0, 5).map(a => ({
                name: a.dst_domain, count: a.count, percentage: Math.round((a.count / totalApp) * 100),
            })))
        } catch (err) {
            console.error('Failed to fetch dashboard data:', err)
        } finally {
            setLoading(false)
        }
    }, [days])

    useEffect(() => {
        fetchData()
        const t = setInterval(fetchData, 30000)
        return () => clearInterval(t)
    }, [fetchData])

    const handleRunDetection = async () => {
        setRunning(true); setActionMsg('')
        try {
            const res = await detectionsApi.runDetection()
            setActionMsg(res.data.message)
            await fetchData()
        } catch (err) {
            setActionMsg(apiErrorMessage(err, 'Run detection failed'))
        } finally { setRunning(false) }
    }

    const handleExportReport = async () => {
        setExporting(true)
        try {
            const res = await reportApi.generate()
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
            const a = document.createElement('a')
            a.href = url; a.download = 'shadow-it-security-report.pdf'; a.click()
            URL.revokeObjectURL(url)
        } catch (err) { console.error(err) } finally { setExporting(false) }
    }

    if (loading || !summary) {
        return (
            <div className="-m-4 md:-m-6 p-4 md:p-6 min-h-[calc(100vh-64px)] flex items-center justify-center" style={{ background: WK.canvas }}>
                <div className="animate-pulse" style={{ color: WK.muted }}>Loading dashboard…</div>
            </div>
        )
    }

    const byType = summary.by_type || {}
    const byRisk = summary.by_risk || {}
    const total = summary.total_detections || 1
    const resolvedPct = Math.round((summary.resolved / total) * 100)
    const highPct     = Math.round(((byRisk.high ?? 0) / total) * 100)
    const trend = timeline.map(t => ({ period: t.day.slice(5), value: t.count }))
    const trendMax = Math.max(...trend.map(d => d.value), 1)

    return (
        <div className="-m-4 md:-m-6 p-4 md:p-6 min-h-[calc(100vh-64px)]" style={{ background: WK.canvas, color: WK.ink }}>
            {/* Title */}
            <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-extrabold flex items-center gap-2.5" style={{ color: WK.ink }}>
                    Shadow IT
                    <span className="inline-flex items-center justify-center rounded-full px-2 py-1" style={{ background: WK.gold }}>
                        <Sparkles className="w-4 h-4" style={{ color: WK.ink }} />
                    </span>
                    Overview
                </h1>
                {actionMsg && <span className="text-xs" style={{ color: WK.muted }}>{actionMsg}</span>}
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
                {TABS.map(t => (
                    <button key={t} onClick={() => setTab(t)} className={`wk-tab ${tab === t ? 'wk-tab-active' : ''}`}>{t}</button>
                ))}
            </div>

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* LEFT (2 cols) */}
                <div className="lg:col-span-2 space-y-5">
                    {/* KPI row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        <KpiCard label="Resolved" value={summary.resolved} sub={`/ ${total.toLocaleString()}`}
                            pct={resolvedPct} accent="#2a7477" />
                        <KpiCard label="High Risk" value={byRisk.high ?? 0} sub={`/ ${total.toLocaleString()}`}
                            pct={highPct} accent="#1c2624" />
                        <PromoCard admin={admin} running={running} exporting={exporting}
                            onRun={handleRunDetection} onExport={handleExportReport} />
                    </div>

                    {/* Detail panel (driven by tabs) */}
                    <div className="wk-panel p-6">
                        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                            <div className="flex items-center gap-2.5">
                                <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#e2efef' }}>
                                    <BarChart3 className="w-4 h-4" style={{ color: WK.indigo }} />
                                </span>
                                <h3 className="text-lg font-bold" style={{ color: WK.ink }}>{tab}</h3>
                            </div>
                            {tab === 'Timeline' && (
                                <div className="flex items-center gap-2">
                                    <Legend color={WK.indigo} label="Detections" />
                                    <button onClick={() => setDays(days === 7 ? 30 : 7)}
                                        className="flex items-center gap-1 text-xs font-semibold rounded-lg px-3 py-1.5"
                                        style={{ background: WK.white, border: `1px solid ${WK.line}`, color: WK.ink }}>
                                        {days} days <ChevronDown className="w-3 h-3" />
                                    </button>
                                </div>
                            )}
                        </div>

                        {tab === 'Timeline' && <CapsuleChart data={trend} max={trendMax} />}
                        {tab === 'Risk' && <RiskView byRisk={byRisk} total={total} />}
                        {tab === 'Types' && <TypeView byType={byType} />}
                        {tab === 'Top Domains' && <RankedList items={topDomains.map(d => ({ key: d.name, title: d.name, count: d.count, pct: d.percentage }))} accent={WK.indigo} empty="No sampled traffic yet" />}
                        {tab === 'Top Devices' && <RankedList items={topDevices.map(d => ({ key: d.src_ip, title: d.src_ip, count: d.total, pct: Math.round((d.total / (topDevices[0]?.total || 1)) * 100), meta: `${d.open_count} open` }))} accent={WK.coral} mono empty="No offending devices yet" />}
                    </div>
                </div>

                {/* RIGHT (1 col) */}
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <TileLink href="/dashboard/reports" icon={BarChart3} label="Reports" />
                        {admin
                            ? <TileLink href="/dashboard/live-scan" icon={Wifi} label="Live Scan" />
                            : <TileLink href="/dashboard/applications" icon={Package} label="Apps" />}
                    </div>

                    <ResourceRow href="/dashboard/alerts" icon={AlertCircle} title="Alerts"
                        desc="Review detected anomalies & resolve" />
                    <ResourceRow href="/dashboard/devices" icon={Monitor} title="Devices"
                        desc="Device inventory & risk scores" />
                    <ResourceRow href="/dashboard/applications" icon={Package} title="Applications"
                        desc="Destination services seen on the wire" />
                    {admin && (
                        <ResourceRow href="/dashboard/audit" icon={FileText} title="Audit Trail"
                            desc="Immutable compliance activity log" />
                    )}
                </div>
            </div>

            {/* Recent alerts */}
            <div className="wk-panel p-6 mt-5">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                        <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#eef1f0' }}>
                            <ShieldAlert className="w-4 h-4" style={{ color: WK.coral }} />
                        </span>
                        <h3 className="text-lg font-bold" style={{ color: WK.ink }}>Recent Alerts</h3>
                    </div>
                    <Link href="/dashboard/alerts" className="text-xs font-semibold flex items-center gap-1 rounded-lg px-3 py-1.5"
                        style={{ background: WK.indigo, color: '#fff' }}>
                        View all <ArrowUpRight className="w-3 h-3" />
                    </Link>
                </div>
                {summary.recent_alerts.length === 0 ? (
                    <p className="text-center py-10 text-sm" style={{ color: WK.muted }}>No recent alerts</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left" style={{ color: WK.muted }}>
                                    {['Timestamp', 'Source IP', 'Destination', 'Type', 'Risk', 'Status'].map(h => (
                                        <th key={h} className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wide">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {summary.recent_alerts.map(d => (
                                    <tr key={d.id} onClick={() => router.push('/dashboard/alerts')}
                                        className="cursor-pointer" style={{ borderTop: `1px solid ${WK.line}` }}>
                                        <td className="py-3 pr-4 text-xs" style={{ color: WK.muted }}>{fmtTs(d.detected_at)}</td>
                                        <td className="py-3 pr-4 text-xs font-mono" style={{ color: WK.ink }}>{d.src_ip}</td>
                                        <td className="py-3 pr-4 text-xs" style={{ color: WK.ink }}>{d.dst_domain || '—'}</td>
                                        <td className="py-3 pr-4"><Pill text={d.shadow_it_type || 'unknown'} bg="#e2efef" fg={WK.indigo} /></td>
                                        <td className="py-3 pr-4"><RiskPill risk={d.risk_level} /></td>
                                        <td className="py-3 pr-4">
                                            <Pill text={d.is_resolved ? 'resolved' : 'open'}
                                                bg={d.is_resolved ? '#eef1f0' : '#eef1f0'} fg={d.is_resolved ? WK.muted : WK.coral} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}

/* ── KPI card with circular % + segmented progress ── */
function KpiCard({ label, value, sub, pct, accent }: {
    label: string; value: number; sub: string; pct: number; accent: string
}) {
    return (
        <div className="wk-panel p-5">
            <div className="flex items-start justify-between mb-3">
                <span className="text-sm font-semibold" style={{ color: WK.muted }}>{label}</span>
                <CirclePct pct={pct} track="#e9edec" fill={accent} />
            </div>
            <div className="flex items-baseline gap-1.5 mb-4">
                <span className="text-4xl font-extrabold" style={{ color: WK.ink }}>{value.toLocaleString()}</span>
                <span className="text-sm font-medium" style={{ color: WK.muted }}>{sub}</span>
            </div>
            <SegBar pct={pct} color={accent} />
        </div>
    )
}

function SegBar({ pct, color }: { pct: number; color: string }) {
    const N = 8
    const on = Math.round((pct / 100) * N)
    return (
        <div className="flex gap-1.5">
            {Array.from({ length: N }).map((_, i) => (
                <div key={i} className="wk-seg" style={i < on ? { background: color } : undefined} />
            ))}
        </div>
    )
}

function CirclePct({ pct, track, fill }: { pct: number; track: string; fill: string }) {
    const clamped = Math.max(0, Math.min(100, pct))
    return (
        <div className="relative flex items-center justify-center rounded-full px-2 py-1"
            style={{ background: 'rgba(255,255,255,0.6)' }}>
            <svg viewBox="0 0 36 36" width="26" height="26">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke={track} strokeWidth="5" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke={fill} strokeWidth="5"
                    strokeDasharray={`${clamped} ${100 - clamped}`} strokeDashoffset={25} strokeLinecap="round" />
            </svg>
            <span className="ml-1.5 text-xs font-bold" style={{ color: WK.ink }}>{clamped}%</span>
        </div>
    )
}

/* ── Dark promo card ── */
function PromoCard({ admin, running, exporting, onRun, onExport }: {
    admin: boolean; running: boolean; exporting: boolean; onRun: () => void; onExport: () => void
}) {
    return (
        <div className="rounded-[22px] p-5 flex flex-col justify-between relative overflow-hidden"
            style={{ background: WK.indigo, minHeight: 170 }}>
            <div className="absolute rounded-full" style={{ width: 120, height: 120, background: '#4a9ea1', opacity: 0.5, top: -30, right: -30 }} />
            <p className="text-white font-bold text-lg leading-snug relative z-10">Strengthen your<br />security posture</p>
            <div className="relative z-10 mt-4 space-y-2">
                {admin ? (
                    <>
                        <button onClick={onRun} disabled={running}
                            className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
                            style={{ background: '#fff', color: WK.ink }}>
                            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run Detection
                        </button>
                        <button onClick={onExport} disabled={exporting}
                            className="w-full flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold text-white disabled:opacity-60"
                            style={{ background: 'rgba(255,255,255,0.12)' }}>
                            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Export Report
                        </button>
                    </>
                ) : (
                    <Link href="/dashboard/reports"
                        className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold"
                        style={{ background: '#fff', color: WK.ink }}>
                        View Reports <ArrowUpRight className="w-4 h-4" />
                    </Link>
                )}
            </div>
        </div>
    )
}

/* ── Capsule bar chart ── */
function CapsuleChart({ data, max }: { data: { period: string; value: number }[]; max: number }) {
    if (data.length === 0) return <p className="text-sm py-8 text-center" style={{ color: WK.muted }}>No timeline data</p>
    return (
        <div className="flex items-end justify-between gap-2" style={{ height: 220 }}>
            {data.map((d, i) => {
                const h = Math.max(8, Math.round((d.value / max) * 170))
                const isMax = d.value === max && d.value > 0
                return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end gap-2" style={{ height: '100%' }}>
                        <div className="relative flex items-end justify-center" style={{ height: 180 }}>
                            <div className="relative rounded-full flex items-end justify-center"
                                style={{ width: 26, height: h, background: WK.indigo }}>
                                {/* periwinkle inner pill */}
                                <div className="rounded-full absolute" style={{ width: 14, height: Math.max(10, h * 0.45), background: WK.peri, bottom: 6 }} />
                                {/* top dot */}
                                <div className="rounded-full absolute" style={{ width: 8, height: 8, background: '#fff', top: 5, border: `2px solid ${WK.indigo}` }} />
                                {isMax && (
                                    <span className="absolute text-[10px] font-bold rounded-full px-1.5 py-0.5"
                                        style={{ background: WK.indigo, color: '#fff', top: -22, whiteSpace: 'nowrap' }}>{d.value}</span>
                                )}
                            </div>
                        </div>
                        <span className="text-[11px] font-medium" style={{ color: WK.muted }}>{d.period}</span>
                    </div>
                )
            })}
        </div>
    )
}

/* ── Risk & Type views ── */
function RiskView({ byRisk, total }: { byRisk: Partial<Record<string, number>>; total: number }) {
    const rows = [
        { label: 'High Risk', value: byRisk.high ?? 0, color: WK.coral },
        { label: 'Medium Risk', value: byRisk.medium ?? 0, color: WK.gold },
        { label: 'Low Risk', value: byRisk.low ?? 0, color: WK.peri },
    ]
    return (
        <div className="space-y-5 py-2">
            {rows.map(r => {
                const pct = Math.round((r.value / total) * 100)
                return (
                    <div key={r.label}>
                        <div className="flex justify-between mb-2 text-sm">
                            <span className="font-medium" style={{ color: WK.ink }}>{r.label}</span>
                            <span className="font-bold" style={{ color: WK.ink }}>{r.value} · {pct}%</span>
                        </div>
                        <div className="h-3 rounded-full overflow-hidden" style={{ background: '#e9edec' }}>
                            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7 }}
                                className="h-full rounded-full" style={{ background: r.color }} />
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

function TypeView({ byType }: { byType: Partial<Record<string, number>> }) {
    const rows = [
        { label: 'Software', desc: 'Unauthorized apps', value: byType.software ?? 0, icon: Code2, bg: '#e2efef', fg: WK.indigo },
        { label: 'Hardware', desc: 'Unauthorized devices', value: byType.hardware ?? 0, icon: Cpu, bg: '#eef1f0', fg: WK.coral },
        ...(byType.mixed != null ? [{ label: 'Mixed', desc: 'Hardware + software', value: byType.mixed, icon: Smartphone, bg: '#eef1f0', fg: '#6b7a78' }] : []),
    ]
    return (
        <div className="space-y-3 py-1">
            {rows.map(r => (
                <div key={r.label} className="flex items-center justify-between rounded-2xl px-4 py-3.5" style={{ background: r.bg }}>
                    <div className="flex items-center gap-3">
                        <r.icon className="w-5 h-5" style={{ color: r.fg }} />
                        <div>
                            <p className="text-sm font-semibold" style={{ color: WK.ink }}>{r.label}</p>
                            <p className="text-xs" style={{ color: WK.muted }}>{r.desc}</p>
                        </div>
                    </div>
                    <span className="text-2xl font-extrabold" style={{ color: r.fg }}>{r.value}</span>
                </div>
            ))}
        </div>
    )
}

/* ── Ranked list (domains / devices) ── */
function RankedList({ items, accent, mono, empty }: {
    items: { key: string; title: string; count: number; pct: number; meta?: string }[]
    accent: string; mono?: boolean; empty: string
}) {
    if (items.length === 0) return <p className="text-sm py-8 text-center" style={{ color: WK.muted }}>{empty}</p>
    return (
        <div className="space-y-3 py-1">
            {items.map((it, idx) => (
                <div key={it.key} className="rounded-2xl px-4 py-3" style={{ background: '#f7f8f8', border: `1px solid ${WK.line}` }}>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3 min-w-0">
                            <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                                style={{ background: `${accent}22`, color: accent }}>{idx + 1}</span>
                            <span className={`text-sm font-medium truncate ${mono ? 'font-mono' : ''}`} style={{ color: WK.ink }}>{it.title}</span>
                        </div>
                        <span className="text-sm font-bold flex-shrink-0" style={{ color: accent }}>{it.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#e9edec' }}>
                        <div className="h-full rounded-full" style={{ width: `${it.pct}%`, background: accent }} />
                    </div>
                    {it.meta && <span className="text-xs mt-1.5 inline-block" style={{ color: WK.muted }}>{it.meta}</span>}
                </div>
            ))}
        </div>
    )
}

/* ── Right column widgets ── */
function TileLink({ href, icon: Icon, label }: { href: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string }) {
    return (
        <Link href={href} className="wk-panel p-5 flex flex-col items-center justify-center gap-2 text-center hover:-translate-y-0.5 transition-transform" style={{ borderRadius: 18 }}>
            <span className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: '#e2efef' }}>
                <Icon className="w-5 h-5" style={{ color: WK.indigo }} />
            </span>
            <span className="text-sm font-semibold" style={{ color: WK.ink }}>{label}</span>
        </Link>
    )
}

function ResourceRow({ href, icon: Icon, title, desc }: {
    href: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; title: string; desc: string
}) {
    return (
        <Link href={href} className="wk-panel px-4 py-3.5 flex items-center gap-3 hover:-translate-y-0.5 transition-transform" style={{ borderRadius: 16 }}>
            <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#eef1f0' }}>
                <Icon className="w-4 h-4" style={{ color: WK.ink }} />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold" style={{ color: WK.ink }}>{title}</p>
                <p className="text-xs truncate" style={{ color: WK.muted }}>{desc}</p>
            </div>
            <ArrowUpRight className="w-4 h-4 flex-shrink-0" style={{ color: WK.muted }} />
        </Link>
    )
}

/* ── small bits ── */
function Legend({ color, label }: { color: string; label: string }) {
    return (
        <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: WK.muted }}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} /> {label}
        </span>
    )
}

function Pill({ text, bg, fg }: { text: string; bg: string; fg: string }) {
    return <span className="text-xs font-semibold rounded-full px-2.5 py-1 capitalize" style={{ background: bg, color: fg }}>{text}</span>
}

function RiskPill({ risk }: { risk: string | null }) {
    const map: Record<string, { bg: string; fg: string }> = {
        high: { bg: '#eef1f0', fg: WK.coral }, medium: { bg: '#eef1f0', fg: '#6b7a78' }, low: { bg: '#e2efef', fg: WK.indigo },
    }
    const c = map[risk ?? ''] ?? { bg: '#eef1f0', fg: WK.muted }
    return <span className="text-xs font-bold rounded-full px-2.5 py-1 uppercase" style={{ background: c.bg, color: c.fg }}>{risk ?? '—'}</span>
}
