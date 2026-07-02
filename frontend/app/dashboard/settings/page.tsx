'use client'
import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import GlassCard from '@/components/ui/GlassCard'
import { Check, Sun, Moon } from 'lucide-react'

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
    return (
        <button onClick={onChange}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-blue-500' : 'bg-slate-300 dark:bg-white/15'}`}>
            <motion.span animate={{ x: checked ? 20 : 2 }} className="inline-block h-5 w-5 transform rounded-full bg-white shadow" />
        </button>
    )
}

export default function SettingsPage() {
    const [isDark, setIsDark] = useState(false)

    useEffect(() => { setIsDark(document.documentElement.classList.contains('dark')) }, [])

    const toggleDark = useCallback(() => {
        const next = !isDark
        setIsDark(next)
        document.documentElement.classList.toggle('dark', next)
        localStorage.setItem('darkMode', JSON.stringify(next))
    }, [isDark])

    return (
        <div className="space-y-6">
            <GlassCard className="p-6">
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">Appearance</h3>
                <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                            {isDark ? <Moon className="w-5 h-5 text-blue-400" /> : <Sun className="w-5 h-5 text-amber-500" />}
                            <div>
                                <p className="text-sm font-medium text-slate-900 dark:text-white">Dark Mode</p>
                                <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">Switch between light and dark themes</p>
                            </div>
                        </div>
                        <Toggle checked={isDark} onChange={toggleDark} />
                    </div>

                    <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Theme Preview</p>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => { if (isDark) toggleDark() }}
                                className={`p-4 rounded-xl border-2 transition-all text-left ${!isDark ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                                <div className="w-full h-14 rounded-lg bg-slate-100 mb-2.5 flex items-center justify-center">
                                    <div className="space-y-1.5 w-3/4">
                                        <div className="h-2 bg-slate-300 rounded" />
                                        <div className="h-2 bg-slate-200 rounded w-2/3" />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Light</span>
                                    {!isDark && <Check className="w-3.5 h-3.5 text-blue-500" />}
                                </div>
                            </button>
                            <button onClick={() => { if (!isDark) toggleDark() }}
                                className={`p-4 rounded-xl border-2 transition-all text-left ${isDark ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                                <div className="w-full h-14 rounded-lg bg-slate-800 mb-2.5 flex items-center justify-center">
                                    <div className="space-y-1.5 w-3/4">
                                        <div className="h-2 bg-slate-600 rounded" />
                                        <div className="h-2 bg-slate-700 rounded w-2/3" />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Dark</span>
                                    {isDark && <Check className="w-3.5 h-3.5 text-blue-500" />}
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </GlassCard>
        </div>
    )
}
