'use client'
import { useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, Shield, Zap, BarChart3, Lock } from 'lucide-react'
import { authApi, apiErrorMessage } from '@/lib/api'
import { setAuthFromLogin } from '@/lib/auth'

const LoginBackground = dynamic(() => import('@/components/LoginBackground'), { ssr: false })

const FEATURES = [
    { icon: Zap,       text: 'Real-time anomaly detection via Isolation Forest' },
    { icon: Shield,    text: 'Role-based access control & JWT authentication' },
    { icon: BarChart3, text: 'Interactive dashboard with risk analytics' },
    { icon: Lock,      text: 'Immutable audit trail for compliance' },
]

function LoginPageInner() {
    const [username, setUsernameField] = useState('')
    const [password, setPassword]      = useState('')
    const [error, setError]            = useState('')
    const [loading, setLoading]        = useState(false)
    const [showPass, setShowPass]      = useState(false)
    const router = useRouter()

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)
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
        <div suppressHydrationWarning className="min-h-screen flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm overflow-hidden">
            <LoginBackground />

            <motion.div
                initial={{ opacity: 0, scale: 0.93 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                className="relative w-full max-w-5xl flex rounded-3xl overflow-hidden border border-white/10 shadow-2xl"
                style={{ minHeight: 620 }}
            >
                {/* ── LEFT PANEL ── */}
                <div className="hidden md:flex w-5/12 bg-gradient-to-br from-blue-700/25 via-blue-600/15 to-black/50 backdrop-blur-md p-10 flex-col justify-between border-r border-white/8">
                    <LeftContent />
                </div>

                {/* ── RIGHT PANEL ── */}
                <div className="w-full md:w-7/12 bg-black/25 backdrop-blur-xl p-8 md:p-12 flex flex-col justify-center">
                    <MobileBrand />
                    <h3 className="text-2xl font-bold text-white mb-1">Sign In</h3>
                    <p className="text-white/50 text-sm mb-7">Access restricted to authorised personnel</p>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <FormInput label="Username" value={username} onChange={setUsernameField} placeholder="Enter your username" required disabled={loading} autoComplete="username" />
                        <PasswordInput label="Password" value={password} onChange={setPassword} show={showPass} onToggle={() => setShowPass(p => !p)} disabled={loading} />

                        <AnimatePresence>
                            {error && <ErrorMsg message={error} />}
                        </AnimatePresence>
                        <SubmitButton loading={loading} label="Sign In" loadingLabel="Signing in…" />
                    </form>
                </div>
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

/* ── Sub-components ── */

function MobileBrand() {
    return (
        <div className="flex items-center gap-2.5 mb-6 md:hidden">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
                <Shield className="w-4 h-4 text-blue-400" />
            </div>
            <span className="text-lg font-bold text-white">Sentinel</span>
        </div>
    )
}

function LeftContent() {
    return (
        <>
            <div>
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                        <p className="text-lg font-bold text-white leading-tight">Sentinel</p>
                        <p className="text-[10px] text-white/40 uppercase tracking-widest">Detection</p>
                    </div>
                </div>
                <h2 className="text-3xl font-bold text-white mb-2">Welcome Back</h2>
                <p className="text-white/55 text-sm mb-8">Sign in to access your Sentinel dashboard</p>
                <div className="space-y-3.5">
                    {FEATURES.map(({ icon: Icon, text }) => (
                        <div key={text} className="flex items-start gap-3">
                            <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <Icon className="w-3.5 h-3.5 text-blue-400" />
                            </div>
                            <p className="text-sm text-white/65">{text}</p>
                        </div>
                    ))}
                </div>
            </div>
            <div>
                <p className="text-xs text-white/35 mb-3">By accessing this system, you agree to our</p>
                <div className="flex gap-4">
                    <Link href="/privacy" className="text-xs text-blue-400 hover:text-blue-300 transition-colors hover:underline">Privacy Policy</Link>
                    <Link href="/terms" className="text-xs text-blue-400 hover:text-blue-300 transition-colors hover:underline">Terms &amp; Conditions</Link>
                </div>
                <p className="text-xs text-white/20 mt-4">University of Mines &amp; Technology, Tarkwa · Dept. Cybersecurity &amp; IS</p>
            </div>
        </>
    )
}

function FormInput({ label, value, onChange, placeholder, type = 'text', required = false, disabled = false, hint, autoComplete }: {
    label: string; value: string; onChange: (v: string) => void; placeholder: string
    type?: string; required?: boolean; disabled?: boolean; hint?: string; autoComplete?: string
}) {
    return (
        <div>
            <label className="block text-xs font-medium text-white/65 mb-1.5">{label}</label>
            <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                required={required} disabled={disabled} autoComplete={autoComplete}
                className="w-full px-4 py-3 rounded-xl border focus:outline-none transition-all text-sm disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', color: '#ffffff' }} />
            {hint && <p className="text-xs text-white/35 mt-1">{hint}</p>}
        </div>
    )
}

function PasswordInput({ label, value, onChange, show, onToggle, disabled, hint }: {
    label: string; value: string; onChange: (v: string) => void
    show: boolean; onToggle: () => void; disabled: boolean; hint?: string
}) {
    return (
        <div>
            <label className="block text-xs font-medium text-white/65 mb-1.5">{label}</label>
            <div className="relative">
                <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
                    placeholder="••••••••" required disabled={disabled} autoComplete="current-password"
                    className="w-full px-4 py-3 pr-11 rounded-xl border focus:outline-none transition-all text-sm disabled:opacity-50"
                    style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', color: '#ffffff' }} />
                <button type="button" onClick={onToggle} tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors">
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
            </div>
            {hint && <p className="text-xs text-white/35 mt-1">{hint}</p>}
        </div>
    )
}

function ErrorMsg({ message }: { message: string }) {
    return (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
            {message}
        </motion.div>
    )
}

function SubmitButton({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) {
    return (
        <motion.button whileHover={{ scale: loading ? 1 : 1.02 }} whileTap={{ scale: loading ? 1 : 0.98 }}
            type="submit" disabled={loading}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                </svg>
            )}
            {loading ? loadingLabel : label}
        </motion.button>
    )
}
