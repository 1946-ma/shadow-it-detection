'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import { getToken } from '@/lib/auth'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

    useEffect(() => {
        if (!getToken()) router.push('/login')
    }, [router])

    return (
        <div className="flex min-h-screen">
            <Sidebar
                mobileOpen={mobileSidebarOpen}
                onClose={() => setMobileSidebarOpen(false)}
            />
            <div className="flex-1 flex flex-col md:ml-16 lg:ml-64 min-w-0">
                <Topbar onMenuClick={() => setMobileSidebarOpen(true)} />
                <main className="flex-1 p-4 md:p-6 space-y-4 md:space-y-6 min-w-0">
                    {children}
                </main>
            </div>
        </div>
    )
}
