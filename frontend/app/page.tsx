'use client'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Cookies from 'js-cookie'

export default function RootPage() {
    const router = useRouter()

    useEffect(() => {
        const token = Cookies.get('token')
        if (token) {
            router.push('/dashboard')
        } else {
            router.push('/login')
        }
    }, [router])

    return null
}
