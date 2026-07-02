const colours: Record<string, string> = {
    high: 'bg-red-500/15 text-red-400 border-red-500/30',
    medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    hardware: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    software: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    open: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    reviewed: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    dismissed: 'bg-zinc-500/15 text-zinc-500 border-zinc-700/30',
}

export default function Badge({ label }: { label: string }) {
    const cls = colours[label] ?? 'bg-slate-700 text-slate-300'
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
            {label}
        </span>
    )
}
