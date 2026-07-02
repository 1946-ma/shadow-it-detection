interface Props {
    level: 'low' | 'medium' | 'high' | null
    score?: number
}

export default function RiskMeter({ level, score }: Props) {
    const bgColor = {
        low: 'bg-emerald-500/20 border-emerald-500/40',
        medium: 'bg-amber-500/20 border-amber-500/40',
        high: 'bg-red-500/20 border-red-500/40',
        null: 'bg-slate-500/20 border-slate-500/40',
    }[level || 'null']

    const textColor = {
        low: 'text-emerald-400',
        medium: 'text-amber-400',
        high: 'text-red-400',
        null: 'text-slate-400',
    }[level || 'null']

    return (
        <div className={`inline-flex items-center px-3 py-1.5 rounded-full border ${bgColor}`}>
            <div className="w-2 h-2 rounded-full mr-2" style={{
                backgroundColor: {
                    low: '#10b981',
                    medium: '#f59e0b',
                    high: '#ef4444',
                    null: '#64748b',
                }[level || 'null']
            }} />
            <span className={`text-xs font-medium ${textColor}`}>
                {level ? level.charAt(0).toUpperCase() + level.slice(1) : 'Unknown'}
                {score !== undefined && ` (${score.toFixed(2)})`}
            </span>
        </div>
    )
}
