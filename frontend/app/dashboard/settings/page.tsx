'use client'
import GlassCard from '@/components/ui/GlassCard'
import { Palette, Check } from 'lucide-react'

const SWATCHES = [
    { name: 'Teal',   hex: '#2a7477' },
    { name: 'Ink',    hex: '#14201f' },
    { name: 'Gray',   hex: '#9aa7a5' },
    { name: 'Line',   hex: '#e6e9e8' },
    { name: 'Canvas', hex: '#f5f6f6' },
]

export default function SettingsPage() {
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
                        <p className="text-xs mt-0.5" style={{ color: '#7c8b89' }}>Sentinel uses a single clean light theme.</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5"
                        style={{ background: 'rgba(42,116,119,0.10)', color: '#2a7477' }}>
                        <Check className="w-3.5 h-3.5" /> Light
                    </span>
                </div>

                <p className="text-xs font-semibold mb-3" style={{ color: '#7c8b89' }}>Palette</p>
                <div className="flex flex-wrap gap-4">
                    {SWATCHES.map(s => (
                        <div key={s.name} className="flex flex-col items-center gap-1.5">
                            <span className="w-12 h-12 rounded-2xl" style={{ background: s.hex, boxShadow: '0 6px 16px rgba(13,16,48,0.12)' }} />
                            <span className="text-[11px] font-medium" style={{ color: '#14201f' }}>{s.name}</span>
                            <span className="text-[10px]" style={{ color: '#b6bacb' }}>{s.hex}</span>
                        </div>
                    ))}
                </div>
            </GlassCard>
        </div>
    )
}
