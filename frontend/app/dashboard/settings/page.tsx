'use client'
import { useState } from 'react'
import GlassCard from '@/components/ui/GlassCard'
import { Palette, Check, Copy } from 'lucide-react'

const SWATCHES = [
    { name: 'Teal',   hex: '#2a7477' },
    { name: 'Ink',    hex: '#14201f' },
    { name: 'Gray',   hex: '#9aa7a5' },
    { name: 'Line',   hex: '#e6e9e8' },
    { name: 'Canvas', hex: '#f5f6f6' },
]

// Perceived-luminance check so the copy/tick icon contrasts on each swatch.
function isLight(hex: string): boolean {
    const n = parseInt(hex.slice(1), 16)
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150
}

export default function SettingsPage() {
    const [copied, setCopied] = useState<string | null>(null)

    const copy = async (hex: string) => {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(hex)
            } else {
                // Fallback for non-secure contexts (e.g. the LAN deployment over http).
                const ta = document.createElement('textarea')
                ta.value = hex
                ta.style.position = 'fixed'
                ta.style.opacity = '0'
                document.body.appendChild(ta)
                ta.select()
                document.execCommand('copy')
                document.body.removeChild(ta)
            }
            setCopied(hex)
            window.setTimeout(() => setCopied((c) => (c === hex ? null : c)), 1400)
        } catch {
            /* clipboard unavailable — ignore */
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-extrabold" style={{ color: '#14201f' }}>Settings</h1>
                <p className="text-sm mt-1" style={{ color: '#7c8b89' }}>Appearance & preferences</p>
            </div>

            <GlassCard className="p-6">
                <div className="flex items-center gap-2.5 mb-5">
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#e2efef' }}>
                        <Palette className="w-4 h-4" style={{ color: '#2a7477' }} />
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
                        style={{ background: 'rgba(42,116,119,0.10)', color: '#2a7477' }}>
                        <Check className="w-3.5 h-3.5" /> Light
                    </span>
                </div>

                <p className="text-xs font-semibold mb-1" style={{ color: '#7c8b89' }}>Palette</p>
                <p className="text-[11px] mb-3" style={{ color: '#b6bacb' }}>Click a swatch to copy its hex.</p>
                <div className="flex flex-wrap gap-4">
                    {SWATCHES.map((s) => {
                        const fg = isLight(s.hex) ? '#14201f' : '#ffffff'
                        const isCopied = copied === s.hex
                        return (
                            <button
                                key={s.name}
                                type="button"
                                onClick={() => copy(s.hex)}
                                title={`Copy ${s.hex}`}
                                aria-label={`Copy ${s.name} ${s.hex}`}
                                className="group flex flex-col items-center gap-1.5 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#2a7477]"
                            >
                                <span
                                    className="relative w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-105 group-active:scale-95"
                                    style={{ background: s.hex, boxShadow: '0 6px 16px rgba(13,16,48,0.12)' }}
                                >
                                    {isCopied ? (
                                        <Check className="w-5 h-5" style={{ color: fg }} />
                                    ) : (
                                        <Copy className="w-4 h-4 opacity-0 group-hover:opacity-70 transition-opacity" style={{ color: fg }} />
                                    )}
                                </span>
                                <span className="text-[11px] font-medium" style={{ color: '#14201f' }}>{s.name}</span>
                                <span className="text-[10px] font-medium" style={{ color: isCopied ? '#2a7477' : '#b6bacb' }}>
                                    {isCopied ? 'Copied!' : s.hex}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </GlassCard>
        </div>
    )
}
