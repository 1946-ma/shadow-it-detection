'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { User, LogOut } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import { authApi } from '@/lib/api'
import { getUsername, getRole, clearAuth, isAuthenticated } from '@/lib/auth'

export default function ProfilePage() {
    const router = useRouter()
    const [username, setUsername] = useState<string | undefined>()
    const [role, setRole] = useState<string | undefined>()

    useEffect(() => {
        if (!isAuthenticated()) { router.push('/login'); return }
        setUsername(getUsername())
        setRole(getRole())
    }, [router])

    const handleLogout = async () => {
        try { await authApi.logout() } catch { /* logout locally even if the request fails */ }
        clearAuth()
        router.push('/login')
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Profile</h1>
                <p className="text-slate-700 dark:text-slate-400 mt-1">Your account details</p>
            </div>

            <GlassCard className="p-6 max-w-md">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
                        <User className="w-7 h-7 text-blue-400" />
                    </div>
                    <div>
                        <p className="text-lg font-bold text-slate-900 dark:text-white">{username}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-500 capitalize">{role}</p>
                    </div>
                </div>

                <div className="divide-y divide-slate-200 dark:divide-slate-700">
                    <div className="flex items-center justify-between py-3">
                        <span className="text-sm text-slate-500 dark:text-slate-400">Username</span>
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{username}</span>
                    </div>
                    <div className="flex items-center justify-between py-3">
                        <span className="text-sm text-slate-500 dark:text-slate-400">Role</span>
                        <span className="px-3 py-1 rounded-full text-xs font-semibold capitalize"
                            style={{ backgroundColor: role === 'admin' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)', color: role === 'admin' ? '#ef4444' : '#3b82f6' }}>
                            {role}
                        </span>
                    </div>
                </div>

                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleLogout}
                    className="w-full mt-6 px-4 py-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-500 dark:text-red-400 hover:bg-red-500/25 transition-all font-medium text-sm flex items-center justify-center gap-2">
                    <LogOut className="w-4 h-4" /> Sign Out
                </motion.button>
            </GlassCard>
        </div>
    )
}
