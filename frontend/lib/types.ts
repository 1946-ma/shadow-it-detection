export interface User {
    id: number
    username: string
    role: 'admin' | 'viewer'
}

export type ShadowItType = 'hardware' | 'software' | 'mixed'
export type RiskLevel = 'high' | 'medium' | 'low'

export interface Detection {
    id: number
    src_ip: string
    src_mac: string | null
    dst_domain: string | null
    protocol: string | null
    bytes_sent: number
    bytes_received: number
    duration: number
    device_type: string | null
    shadow_it_type: ShadowItType | null
    risk_level: RiskLevel | null
    anomaly_score: number | null
    detected_at: string
    is_resolved: boolean
}

export interface AuditLog {
    id: number
    username: string | null
    action: string
    target: string | null
    ip_address: string | null
    timestamp: string
}

export interface AlertSummary {
    id: number
    src_ip: string
    dst_domain: string | null
    shadow_it_type: ShadowItType | null
    risk_level: RiskLevel | null
    detected_at: string
    is_resolved: boolean
}

export interface DashboardSummary {
    total_detections: number
    resolved: number
    unresolved: number
    by_type: Partial<Record<ShadowItType, number>>
    by_risk: Partial<Record<RiskLevel, number>>
    recent_alerts: AlertSummary[]
}

export interface TimelinePoint {
    day: string
    count: number
}

export interface TopOffender {
    src_ip: string
    total: number
    high_count: number
    medium_count: number
    low_count: number
    open_count: number
    last_seen: string | null
}

export interface MetricsSummary {
    accuracy: number | null
    precision: number | null
    recall: number | null
    f1_score: number | null
    false_positive_rate: number | null
    roc_auc: number | null
    tp: number | null
    tn: number | null
    fp: number | null
    fn: number | null
    // Hybrid stage breakdown: IF = IsolationForest (unsupervised), RF = RandomForest (supervised)
    if_accuracy: number | null
    if_precision: number | null
    if_recall: number | null
    rf_accuracy: number | null
    rf_precision: number | null
    rf_recall: number | null
    holdout_rows: number | null
    detection_time_s: number | null
    scenario_correct: number | null
    scenario_total: number | null
}

export interface ScenarioResult {
    id: string
    type: string
    description: string
    expected: number | null
    predicted: number | null
    correct: boolean
    shadow_it_type: string
    risk_level: string
    anomaly_score: number | null
    response_ms: number | null
}

export interface MetricsResponse {
    summary: MetricsSummary
    scenarios: ScenarioResult[]
}

export interface ScanStatus {
    running: boolean
    packets_seen: number
    flows_analysed: number
    active_flows: number
    detections_found: number
    uptime_s: number
    errors: string[]
    error?: string
}

export interface NetworkInterface {
    device: string
    description: string
    ip: string | null
}
