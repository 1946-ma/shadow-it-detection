'use client'
import { useEffect } from 'react'

export default function Providers({ children }: { children: React.ReactNode }) {
    // WINCK is light-only. Ensure the legacy dark class is never present.
    useEffect(() => {
        document.documentElement.classList.remove('dark')
    }, [])

    return <>{children}</>
}
