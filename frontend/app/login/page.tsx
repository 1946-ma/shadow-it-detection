'use client'
import { useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { authApi, apiErrorMessage } from '@/lib/api'
import { setAuthFromLogin } from '@/lib/auth'

const TEAL = '#33888a'

function LoginPageInner() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError]       = useState('')
    const [loading, setLoading]   = useState(false)
    const [showPass, setShowPass] = useState(false)
    const router = useRouter()

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(''); setLoading(true)
        try {
            const res = await authApi.login(username, password)
            setAuthFromLogin(res.data.token, res.data.user)
            router.push('/dashboard')
        } catch (err) {
            setError(apiErrorMessage(err, 'Invalid username or password'))
            setLoading(false)
        }
    }

    return (
        <div suppressHydrationWarning className="auth-dark min-h-screen flex items-center justify-center p-4 sm:p-8"
            style={{ background: '#16181c' }}>
            <div className="w-full max-w-5xl grid md:grid-cols-2 rounded-3xl overflow-hidden shadow-2xl"
                style={{ background: '#212429', minHeight: 600 }}>

                {/* ── LEFT: image scene ── */}
                <div className="relative hidden md:block overflow-hidden"
                    style={{ background: 'linear-gradient(165deg, #3d8486 0%, #1f3a3b 52%, #0e1c1d 100%)' }}>
                    <div className="absolute" style={{ width: 320, height: 320, borderRadius: '50%', top: '6%', left: '14%', background: 'radial-gradient(circle, rgba(150,205,205,0.45), transparent 70%)' }} />
                    <svg viewBox="0 0 400 300" preserveAspectRatio="none" className="absolute bottom-0 left-0 w-full" style={{ height: '55%' }}>
                        <path d="M0,170 C120,110 250,210 400,140 L400,300 L0,300 Z" fill="#173433" opacity="0.9" />
                        <path d="M0,225 C140,175 280,255 400,205 L400,300 L0,300 Z" fill="#0d1f1f" />
                    </svg>

                    <div className="relative z-10 h-full flex flex-col justify-between p-8">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(6px)' }}>
                                <ShieldCheck className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-lg font-bold tracking-tight text-white">Sentinel</span>
                        </div>

                        <div>
                            <p className="text-white text-[26px] font-semibold leading-snug" style={{ letterSpacing: '0.2px' }}>
                                Detecting the unseen,<br />securing every flow.
                            </p>
                            <div className="flex items-center gap-1.5 mt-5">
                                <span className="h-1 rounded-full" style={{ width: 16, background: 'rgba(255,255,255,0.35)' }} />
                                <span className="h-1 rounded-full" style={{ width: 16, background: 'rgba(255,255,255,0.35)' }} />
                                <span className="h-1 rounded-full" style={{ width: 30, background: '#ffffff' }} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── RIGHT: form ── */}
                <div className="p-8 sm:p-12 flex flex-col justify-center" style={{ background: '#212429' }}>
                    <h1 className="text-4xl sm:text-[2.7rem] font-bold mb-2 tracking-tight text-white">Welcome back</h1>
                    <p className="text-sm mb-8" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        Sign in to your Sentinel dashboard. New here?{' '}
                        <button type="button" className="font-medium underline" style={{ color: TEAL }} onClick={() => setError('Contact your system administrator for access.')}>
                            Request access
                        </button>
                    </p>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <input
                            type="text"
                            className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all"
                            value={username} onChange={e => setUsername(e.target.value)}
                            placeholder="Username" required disabled={loading} autoComplete="username"
                        />
                        <div className="relative">
                            <input
                                className="w-full px-4 py-3.5 pr-11 rounded-xl text-sm outline-none transition-all"
                                type={showPass ? 'text' : 'password'}
                                value={password} onChange={e => setPassword(e.target.value)}
                                placeholder="Enter your password" required disabled={loading} autoComplete="current-password"
                            />
                            <button type="button" onClick={() => setShowPass(p => !p)} tabIndex={-1}
                                className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.45)' }}>
                                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>

                        <AnimatePresence>
                            {error && (
                                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                    className="flex items-center gap-2 text-sm rounded-xl px-3 py-2.5"
                                    style={{ background: 'rgba(255,255,255,0.06)', color: '#e6b9bd', border: '1px solid rgba(255,120,130,0.3)' }}>
                                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#ff7b86' }} />
                                    {error}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <motion.button whileTap={{ scale: loading ? 1 : 0.98 }} type="submit" disabled={loading}
                            className="w-full py-3.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                            style={{ background: TEAL }}
                            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#2c7476' }}
                            onMouseLeave={e => { e.currentTarget.style.background = TEAL }}>
                            {loading && (
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                                </svg>
                            )}
                            {loading ? 'Signing in…' : 'Sign in'}
                        </motion.button>
                    </form>

                    <p className="text-[11px] mt-10" style={{ color: 'rgba(255,255,255,0.28)' }}>
                        University of Mines &amp; Technology, Tarkwa · Dept. Cybersecurity &amp; IS
                    </p>
                </div>
            </div>
        </div>
    )
}

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginPageInner />
        </Suspense>
    )
}
