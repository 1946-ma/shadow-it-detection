'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { authApi, apiErrorMessage } from '@/lib/api'
import { setAuthFromLogin } from '@/lib/auth'

const TEAL = '#33888a'

const EASE = [0.22, 1, 0.36, 1] as const

const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.09, delayChildren: 0.25 } },
}
const item: Variants = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
}

const TAGLINES = [
    ['Detecting the unseen,', 'securing every flow.'],
    ['Every device, every app,', 'under constant watch.'],
    ['Network anomalies,', 'surfaced in real time.'],
]

function LoginPageInner() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError]       = useState('')
    const [loading, setLoading]   = useState(false)
    const [showPass, setShowPass] = useState(false)
    const [slide, setSlide]       = useState(0)
    const router = useRouter()

    useEffect(() => {
        const t = setInterval(() => setSlide(s => (s + 1) % TAGLINES.length), 3200)
        return () => clearInterval(t)
    }, [])

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
            <motion.div
                initial={{ opacity: 0, y: 28, scale: 0.975 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.7, ease: EASE }}
                className="w-full max-w-5xl grid md:grid-cols-2 rounded-3xl overflow-hidden shadow-2xl"
                style={{ background: '#212429', minHeight: 600 }}
            >
                {/* ── LEFT: liquid-glass water scene ── */}
                <div className="relative hidden md:block overflow-hidden"
                    style={{ background: 'linear-gradient(165deg, #10403f 0%, #0b2726 55%, #071616 100%)' }}>
                    {/* turbulence/displacement filter — makes the water ripple */}
                    <svg className="absolute" style={{ width: 0, height: 0 }} aria-hidden>
                        <defs>
                            <filter id="liquid">
                                <feTurbulence type="fractalNoise" baseFrequency="0.010 0.018" numOctaves="2" seed="7" result="noise">
                                    <animate attributeName="baseFrequency" dur="20s" values="0.010 0.018; 0.016 0.026; 0.010 0.018" repeatCount="indefinite" />
                                </feTurbulence>
                                <feDisplacementMap in="SourceGraphic" in2="noise" scale="34" xChannelSelector="R" yChannelSelector="G" />
                            </filter>
                        </defs>
                    </svg>

                    {/* flowing water — soft blobs displaced by the filter */}
                    <div className="absolute inset-0" style={{ filter: 'url(#liquid)' }}>
                        <motion.div className="absolute rounded-full"
                            style={{ width: 380, height: 380, top: '-8%', left: '-6%', background: 'radial-gradient(circle, rgba(74,205,198,0.55), transparent 68%)', filter: 'blur(30px)' }}
                            animate={{ x: [0, 40, -10, 0], y: [0, 30, 60, 0], scale: [1, 1.15, 0.95, 1] }}
                            transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} />
                        <motion.div className="absolute rounded-full"
                            style={{ width: 320, height: 320, bottom: '2%', right: '-8%', background: 'radial-gradient(circle, rgba(51,136,138,0.6), transparent 66%)', filter: 'blur(28px)' }}
                            animate={{ x: [0, -34, 12, 0], y: [0, -26, -50, 0], scale: [1, 1.2, 1, 1] }}
                            transition={{ duration: 17, repeat: Infinity, ease: 'easeInOut' }} />
                        <motion.div className="absolute rounded-full"
                            style={{ width: 260, height: 260, top: '38%', left: '30%', background: 'radial-gradient(circle, rgba(120,220,210,0.5), transparent 64%)', filter: 'blur(26px)' }}
                            animate={{ x: [0, 26, -22, 0], y: [0, -18, 24, 0], scale: [1, 0.9, 1.1, 1] }}
                            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }} />
                    </div>

                    {/* frosted glass sheet — the "glass" the water moves inside */}
                    <div className="absolute inset-0" style={{
                        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                        background: 'linear-gradient(160deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02))',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -60px 80px rgba(0,0,0,0.30)',
                    }} />
                    {/* top specular highlight */}
                    <div className="absolute inset-x-0 top-0 pointer-events-none" style={{ height: '45%', background: 'linear-gradient(180deg, rgba(255,255,255,0.14), transparent)' }} />

                    <motion.div variants={container} initial="hidden" animate="show"
                        className="relative z-10 h-full flex flex-col justify-between p-8">
                        {/* logo */}
                        <motion.div variants={item} className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(6px)' }}>
                                <ShieldCheck className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-lg font-bold tracking-tight text-white">Sentinel</span>
                        </motion.div>

                        {/* cycling tagline + dots */}
                        <motion.div variants={item}>
                            <div style={{ minHeight: 74 }}>
                                <AnimatePresence mode="wait">
                                    <motion.p key={slide}
                                        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }}
                                        transition={{ duration: 0.5, ease: EASE }}
                                        className="text-white text-[26px] font-semibold leading-snug" style={{ letterSpacing: '0.2px' }}>
                                        {TAGLINES[slide][0]}<br />{TAGLINES[slide][1]}
                                    </motion.p>
                                </AnimatePresence>
                            </div>
                            <div className="flex items-center gap-1.5 mt-5">
                                {TAGLINES.map((_, i) => (
                                    <motion.span key={i} className="h-1 rounded-full" animate={{ width: i === slide ? 30 : 16, backgroundColor: i === slide ? '#ffffff' : 'rgba(255,255,255,0.35)' }}
                                        transition={{ duration: 0.4, ease: EASE }} style={{ width: 16 }} />
                                ))}
                            </div>
                        </motion.div>
                    </motion.div>
                </div>

                {/* ── RIGHT: form ── */}
                <motion.div variants={container} initial="hidden" animate="show"
                    className="p-8 sm:p-12 flex flex-col justify-center" style={{ background: '#212429' }}>
                    <motion.h1 variants={item} className="text-4xl sm:text-[2.7rem] font-bold mb-2 tracking-tight text-white">Welcome back</motion.h1>
                    <motion.p variants={item} className="text-sm mb-8" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        Sign in to your Sentinel dashboard. New here?{' '}
                        <button type="button" className="font-medium underline" style={{ color: TEAL }} onClick={() => setError('Contact your system administrator for access.')}>
                            Request access
                        </button>
                    </motion.p>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <motion.input variants={item}
                            type="text"
                            className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all"
                            value={username} onChange={e => setUsername(e.target.value)}
                            placeholder="Username" required disabled={loading} autoComplete="username"
                        />
                        <motion.div variants={item} className="relative">
                            <input
                                className="w-full px-4 py-3.5 pr-11 rounded-xl text-sm outline-none transition-all"
                                type={showPass ? 'text' : 'password'}
                                value={password} onChange={e => setPassword(e.target.value)}
                                placeholder="Enter your password" required disabled={loading} autoComplete="current-password"
                            />
                            <button type="button" onClick={() => setShowPass(p => !p)} tabIndex={-1}
                                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors" style={{ color: 'rgba(255,255,255,0.45)' }}>
                                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </motion.div>

                        <AnimatePresence>
                            {error && (
                                <motion.div initial={{ opacity: 0, height: 0, y: -6 }} animate={{ opacity: 1, height: 'auto', y: 0 }} exit={{ opacity: 0, height: 0 }}
                                    className="flex items-center gap-2 text-sm rounded-xl px-3 py-2.5 overflow-hidden"
                                    style={{ background: 'rgba(255,255,255,0.06)', color: '#e6b9bd', border: '1px solid rgba(255,120,130,0.3)' }}>
                                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#ff7b86' }} />
                                    {error}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <motion.button variants={item}
                            whileHover={{ scale: loading ? 1 : 1.015 }} whileTap={{ scale: loading ? 1 : 0.98 }} type="submit" disabled={loading}
                            className="w-full py-3.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
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

                    <motion.p variants={item} className="text-[11px] mt-10" style={{ color: 'rgba(255,255,255,0.28)' }}>
                        University of Mines &amp; Technology, Tarkwa · Dept. Cybersecurity &amp; IS
                    </motion.p>
                </motion.div>
            </motion.div>
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
