'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function Providers({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()

    useEffect(() => {
        if (pathname.startsWith('/login')) {
            document.documentElement.classList.add('dark')
        } else {
            const savedMode = localStorage.getItem('darkMode')
            const isDark = savedMode !== null ? JSON.parse(savedMode) : true
            document.documentElement.classList.toggle('dark', isDark)
        }
    }, [pathname])

    return <>{children}</>
}
