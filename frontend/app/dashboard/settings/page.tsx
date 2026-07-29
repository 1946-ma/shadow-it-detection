'use client'
import { useEffect, useState } from 'react'
import GlassCard from '@/components/ui/GlassCard'
import { Palette, Check } from 'lucide-react'
import { ACCENTS, applyAccent, activeAccent, DEFAULT_ACCENT, type Accent } from '@/lib/accent'

export default function SettingsPage() {
    const [activeId, setActiveId] = useState(DEFAULT_ACCENT.id)

    // Initialise the active accent from storage after mount (client-only).
    useEffect(() => { setActiveId(activeAccent().id) }, [])

    const pickAccent = (a: Accent) => {
        applyAccent(a)
        setActiveId(a.id)
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-extrabold" style={{ color: '#14201f' }}>Settings</h1>
                <p className="text-sm mt-1" style={{ color: '#7c8b89' }}>Appearance & preferences</p>
            </div>

            <GlassCard className="p-6">
                <div className="flex items-center gap-2.5 mb-5">
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-tint)' }}>
                        <Palette className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                    </span>
                    <h3 className="text-lg font-bold" style={{ color: '#14201f' }}>Appearance</h3>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl mb-6"
                    style={{ background: '#f5f6f6', border: '1px solid #e6e9e8' }}>
                    <div>
                        <p className="text-sm font-semibold" style={{ color: '#14201f' }}>Theme</p>
                        <p className="text-xs mt-0.5" style={{ color: '#7c8b89' }}>FishNet uses a single clean light theme.</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5"
                        style={{ background: 'rgba(var(--accent-rgb), 0.10)', color: 'var(--accent-primary)' }}>
                        <Check className="w-3.5 h-3.5" /> Light
                    </span>
                </div>

                {/* ── Accent color picker (recolors the whole app, saved per-browser) ── */}
                <p className="text-xs font-semibold mb-1" style={{ color: '#7c8b89' }}>Accent color</p>
                <p className="text-[11px] mb-3" style={{ color: '#b6bacb' }}>Recolors the app. Remembered in this browser.</p>
                <div className="flex flex-wrap gap-3">
                    {ACCENTS.map((a) => {
                        const active = activeId === a.id
                        return (
                            <button
                                key={a.id}
                                type="button"
                                onClick={() => pickAccent(a)}
                                title={a.name}
                                aria-label={`${a.name} accent${active ? ' (active)' : ''}`}
                                aria-pressed={active}
                                className="group flex flex-col items-center gap-1.5 rounded-2xl focus:outline-none"
                            >
                                <span
                                    className="w-11 h-11 rounded-full flex items-center justify-center transition-transform group-hover:scale-105 group-active:scale-95"
                                    style={{
                                        background: a.primary,
                                        boxShadow: active
                                            ? `0 0 0 2px #fff, 0 0 0 4px ${a.primary}`
                                            : '0 4px 12px rgba(13,16,48,0.12)',
                                    }}
                                >
                                    {active && <Check className="w-5 h-5 text-white" />}
                                </span>
                                <span className="text-[11px] font-medium" style={{ color: active ? '#14201f' : '#7c8b89' }}>{a.name}</span>
                            </button>
                        )
                    })}
                </div>
            </GlassCard>
        </div>
    )
}
