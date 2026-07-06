'use client'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { isAuthenticated } from '@/lib/auth'

export default function RootPage() {
    const router = useRouter()

    useEffect(() => {
        router.push(isAuthenticated() ? '/dashboard' : '/login')
    }, [router])

    return null
}
