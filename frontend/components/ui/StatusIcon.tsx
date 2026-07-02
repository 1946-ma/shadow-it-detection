'use client'
import {
    AlertCircle,
    AlertTriangle,
    CheckCircle,
    XCircle,
    TrendingUp,
    Circle
} from 'lucide-react'

interface StatusIconProps {
    status: 'high' | 'medium' | 'low' | 'active' | 'inactive' | 'open' | 'reviewed' | 'online' | 'trending'
    size?: 'sm' | 'md' | 'lg'
}

const sizeMap = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
}

const statusConfig = {
    high: {
        icon: AlertCircle,
        color: 'text-red-400',
        tooltip: 'High Risk',
    },
    medium: {
        icon: AlertTriangle,
        color: 'text-yellow-400',
        tooltip: 'Medium Risk',
    },
    low: {
        icon: CheckCircle,
        color: 'text-emerald-400',
        tooltip: 'Low Risk',
    },
    active: {
        icon: CheckCircle,
        color: 'text-emerald-400',
        tooltip: 'Active',
    },
    inactive: {
        icon: XCircle,
        color: 'text-slate-500',
        tooltip: 'Inactive',
    },
    open: {
        icon: AlertCircle,
        color: 'text-blue-400',
        tooltip: 'Open',
    },
    reviewed: {
        icon: CheckCircle,
        color: 'text-emerald-400',
        tooltip: 'Reviewed',
    },
    online: {
        icon: Circle,
        color: 'text-emerald-400',
        tooltip: 'Online',
    },
    trending: {
        icon: TrendingUp,
        color: 'text-blue-400',
        tooltip: 'Trending Up',
    },
}

export function StatusIcon({ status, size = 'md' }: StatusIconProps) {
    const config = statusConfig[status]
    const Icon = config.icon

    return (
        <div title={config.tooltip}>
            <Icon className={`${sizeMap[size]} ${config.color}`} />
        </div>
    )
}
