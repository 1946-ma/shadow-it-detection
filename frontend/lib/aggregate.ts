import { detectionsApi } from './api'
import type { Detection, RiskLevel, ShadowItType } from './types'

const RISK_RANK: Record<RiskLevel, number> = { high: 3, medium: 2, low: 1 }
const higherRisk = (a: RiskLevel, b: RiskLevel) => (RISK_RANK[b] > RISK_RANK[a] ? b : a)

// Pages through /api/detections (server caps per_page at 100) up to maxRows,
// used to build client-side device/application aggregates without new backend endpoints.
export async function fetchAllDetections(maxRows = 500): Promise<{ rows: Detection[]; total: number }> {
    const perPage = 100
    const first = await detectionsApi.list({ page: 1, per_page: perPage })
    const total: number = first.data.total || 0
    const rows: Detection[] = [...(first.data.detections || [])]
    const pages = Math.min(Math.ceil(total / perPage), Math.ceil(maxRows / perPage))

    if (pages > 1) {
        const rest = await Promise.all(
            Array.from({ length: pages - 1 }, (_, i) => detectionsApi.list({ page: i + 2, per_page: perPage }))
        )
        for (const res of rest) rows.push(...(res.data.detections || []))
    }
    return { rows: rows.slice(0, maxRows), total }
}

export interface DeviceAggregate {
    src_ip: string | null
    src_mac: string | null
    device_type: string | null
    count: number
    risk: RiskLevel
    lastSeen: string | null
}

export function groupByDevice(rows: Detection[]): DeviceAggregate[] {
    const map = new Map<string, DeviceAggregate>()
    for (const d of rows) {
        const key = d.src_ip || d.src_mac || 'unknown'
        if (!map.has(key)) {
            map.set(key, {
                src_ip: d.src_ip,
                src_mac: d.src_mac,
                device_type: d.device_type,
                count: 0,
                risk: 'low',
                lastSeen: d.detected_at,
            })
        }
        const entry = map.get(key)!
        entry.count += 1
        entry.risk = higherRisk(entry.risk, d.risk_level || 'low')
        if (d.detected_at && (!entry.lastSeen || d.detected_at > entry.lastSeen)) {
            entry.lastSeen = d.detected_at
        }
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
}

export interface ApplicationAggregate {
    dst_domain: string
    shadow_it_type: ShadowItType | null
    count: number
    risk: RiskLevel
    lastSeen: string | null
}

export function groupByApplication(rows: Detection[]): ApplicationAggregate[] {
    const map = new Map<string, ApplicationAggregate>()
    for (const d of rows) {
        const key = d.dst_domain || 'Unknown'
        if (!map.has(key)) {
            map.set(key, {
                dst_domain: key,
                shadow_it_type: d.shadow_it_type,
                count: 0,
                risk: 'low',
                lastSeen: d.detected_at,
            })
        }
        const entry = map.get(key)!
        entry.count += 1
        entry.risk = higherRisk(entry.risk, d.risk_level || 'low')
        if (d.detected_at && (!entry.lastSeen || d.detected_at > entry.lastSeen)) {
            entry.lastSeen = d.detected_at
        }
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
}
