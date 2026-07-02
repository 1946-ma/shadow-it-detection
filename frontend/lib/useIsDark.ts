'use client'
import { useState, useEffect } from 'react'

export function useIsDark() {
    const [isDark, setIsDark] = useState(false)

    useEffect(() => {
        setIsDark(document.documentElement.classList.contains('dark'))

        const observer = new MutationObserver(() => {
            setIsDark(document.documentElement.classList.contains('dark'))
        })
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
        return () => observer.disconnect()
    }, [])

    return isDark
}

export function chartTooltipStyles(isDark: boolean) {
    return {
        contentStyle: {
            background: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.98)',
            border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)',
            borderRadius: 8,
            fontSize: 12,
            color: isDark ? '#e2e8f0' : '#1e293b',
            boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.4)' : '0 4px 20px rgba(0,0,0,0.1)',
        },
        labelStyle: { color: isDark ? '#94a3b8' : '#64748b' },
        itemStyle: { color: isDark ? '#e2e8f0' : '#1e293b' },
        cursor: isDark ? { fill: 'rgba(255,255,255,0.05)' } : { fill: 'rgba(0,0,0,0.04)' },
    }
}
