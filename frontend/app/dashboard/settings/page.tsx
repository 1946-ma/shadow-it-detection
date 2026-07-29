'use client'
import { useEffect, useState } from 'react'
import axios from 'axios'
import GlassCard from '@/components/ui/GlassCard'
import { Palette, Check, UserPlus, KeyRound, Loader2 } from 'lucide-react'
import { ACCENTS, applyAccent, activeAccent, DEFAULT_ACCENT, type Accent } from '@/lib/accent'
import { authApi, apiErrorMessage } from '@/lib/api'
import { isAdmin } from '@/lib/auth'

// Pulls the { error, details: string[] } shape POST /api/auth/users and
// /change-password return on a 400 (weak-password) response.
function errorDetails(err: unknown): string[] {
    if (axios.isAxiosError(err)) {
        const details = (err.response?.data as { details?: string[] } | undefined)?.details
        if (Array.isArray(details)) return details
    }
    return []
}

export default function SettingsPage() {
    const [activeId, setActiveId] = useState(DEFAULT_ACCENT.id)
    // isAdmin() reads a cookie, unavailable during server render — default to
    // false there and pick up the real value after mount so the first client
    // render matches the server (avoids a hydration mismatch).
    const [admin, setAdmin] = useState(false)

    // Initialise the active accent from storage after mount (client-only).
    useEffect(() => { setActiveId(activeAccent().id) }, [])
    useEffect(() => { setAdmin(isAdmin()) }, [])

    const pickAccent = (a: Accent) => {
        applyAccent(a)
        setActiveId(a.id)
    }

    // ── Change my password ──────────────────────────────────────────────────
    const [oldPassword, setOldPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [cpLoading, setCpLoading] = useState(false)
    const [cpError, setCpError] = useState('')
    const [cpDetails, setCpDetails] = useState<string[]>([])
    const [cpSuccess, setCpSuccess] = useState('')

    const handleChangePassword = async () => {
        setCpError(''); setCpDetails([]); setCpSuccess('')
        if (newPassword !== confirmPassword) {
            setCpError('New password and confirmation do not match')
            return
        }
        setCpLoading(true)
        try {
            await authApi.changePassword(oldPassword, newPassword)
            setCpSuccess('Password changed successfully.')
            setOldPassword(''); setNewPassword(''); setConfirmPassword('')
        } catch (err) {
            setCpDetails(errorDetails(err))
            setCpError(apiErrorMessage(err, 'Could not change password'))
        } finally {
            setCpLoading(false)
        }
    }

    // ── Create user (admin only) ────────────────────────────────────────────
    const [newUsername, setNewUsername] = useState('')
    const [newUserPassword, setNewUserPassword] = useState('')
    const [newUserRole, setNewUserRole] = useState<'admin' | 'viewer'>('viewer')
    const [cuLoading, setCuLoading] = useState(false)
    const [cuError, setCuError] = useState('')
    const [cuDetails, setCuDetails] = useState<string[]>([])
    const [cuSuccess, setCuSuccess] = useState('')

    const handleCreateUser = async () => {
        setCuError(''); setCuDetails([]); setCuSuccess('')
        if (!newUsername.trim() || !newUserPassword) {
            setCuError('Username and password are required')
            return
        }
        setCuLoading(true)
        try {
            const res = await authApi.createUser(newUsername.trim(), newUserPassword, newUserRole)
            setCuSuccess(`Created '${res.data.username}' (${res.data.role}).`)
            setNewUsername(''); setNewUserPassword(''); setNewUserRole('viewer')
        } catch (err) {
            setCuDetails(errorDetails(err))
            setCuError(apiErrorMessage(err, 'Could not create user'))
        } finally {
            setCuLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-extrabold" style={{ color: '#14201f' }}>Settings</h1>
                <p className="text-sm mt-1" style={{ color: '#7c8b89' }}>Appearance & preferences</p>
            </div>

            <GlassCard className="p-6">
                <div className="flex items-center gap-2.5 mb-5">
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-tint)' }}>
                        <Palette className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                    </span>
                    <h3 className="text-lg font-bold" style={{ color: '#14201f' }}>Appearance</h3>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl mb-6"
                    style={{ background: '#f5f6f6', border: '1px solid #e6e9e8' }}>
                    <div>
                        <p className="text-sm font-semibold" style={{ color: '#14201f' }}>Theme</p>
                        <p className="text-xs mt-0.5" style={{ color: '#7c8b89' }}>FishNet uses a single clean light theme.</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5"
                        style={{ background: 'rgba(var(--accent-rgb), 0.10)', color: 'var(--accent-primary)' }}>
                        <Check className="w-3.5 h-3.5" /> Light
                    </span>
                </div>

                {/* ── Accent color picker (recolors the whole app, saved per-browser) ── */}
                <p className="text-xs font-semibold mb-1" style={{ color: '#7c8b89' }}>Accent color</p>
                <p className="text-[11px] mb-3" style={{ color: '#b6bacb' }}>Recolors the app. Remembered in this browser.</p>
                <div className="flex flex-wrap gap-3">
                    {ACCENTS.map((a) => {
                        const active = activeId === a.id
                        return (
                            <button
                                key={a.id}
                                type="button"
                                onClick={() => pickAccent(a)}
                                title={a.name}
                                aria-label={`${a.name} accent${active ? ' (active)' : ''}`}
                                aria-pressed={active}
                                className="group flex flex-col items-center gap-1.5 rounded-2xl focus:outline-none"
                            >
                                <span
                                    className="w-11 h-11 rounded-full flex items-center justify-center transition-transform group-hover:scale-105 group-active:scale-95"
                                    style={{
                                        background: a.primary,
                                        boxShadow: active
                                            ? `0 0 0 2px #fff, 0 0 0 4px ${a.primary}`
                                            : '0 4px 12px rgba(13,16,48,0.12)',
                                    }}
                                >
                                    {active && <Check className="w-5 h-5 text-white" />}
                                </span>
                                <span className="text-[11px] font-medium" style={{ color: active ? '#14201f' : '#7c8b89' }}>{a.name}</span>
                            </button>
                        )
                    })}
                </div>
            </GlassCard>

            {/* ── Change my password ──────────────────────────────────────── */}
            <GlassCard className="p-6">
                <div className="flex items-center gap-2.5 mb-5">
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-tint)' }}>
                        <KeyRound className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                    </span>
                    <h3 className="text-lg font-bold" style={{ color: '#14201f' }}>Change Password</h3>
                </div>

                <div className="space-y-3 max-w-sm">
                    <input type="password" placeholder="Current password" value={oldPassword} autoComplete="current-password"
                        onChange={(e) => setOldPassword(e.target.value)}
                        className="w-full px-4 py-2 rounded-lg text-sm"
                        style={{ background: '#f5f6f6', border: '1px solid #e6e9e8', color: '#14201f' }} />
                    <input type="password" placeholder="New password" value={newPassword} autoComplete="new-password"
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-2 rounded-lg text-sm"
                        style={{ background: '#f5f6f6', border: '1px solid #e6e9e8', color: '#14201f' }} />
                    <input type="password" placeholder="Confirm new password" value={confirmPassword} autoComplete="new-password"
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-2 rounded-lg text-sm"
                        style={{ background: '#f5f6f6', border: '1px solid #e6e9e8', color: '#14201f' }} />

                    <p className="text-[11px]" style={{ color: '#b6bacb' }}>
                        At least 12 characters, with an uppercase letter, a lowercase letter, a digit, and a special character.
                    </p>

                    {cpError && (
                        <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#fdecec', color: '#b42318' }}>
                            {cpError}
                            {cpDetails.length > 0 && (
                                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                                    {cpDetails.map((d) => <li key={d}>{d}</li>)}
                                </ul>
                            )}
                        </div>
                    )}
                    {cpSuccess && (
                        <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#e8f6ee', color: '#0a7a41' }}>
                            {cpSuccess}
                        </div>
                    )}

                    <button type="button" onClick={handleChangePassword} disabled={cpLoading}
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-50"
                        style={{ background: 'var(--accent-primary)' }}>
                        {cpLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {cpLoading ? 'Changing…' : 'Change Password'}
                    </button>
                </div>
            </GlassCard>

            {/* ── Create user (admin only) ────────────────────────────────── */}
            {admin && (
                <GlassCard className="p-6">
                    <div className="flex items-center gap-2.5 mb-5">
                        <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-tint)' }}>
                            <UserPlus className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                        </span>
                        <h3 className="text-lg font-bold" style={{ color: '#14201f' }}>Create User</h3>
                    </div>

                    <div className="space-y-3 max-w-sm">
                        <input type="text" placeholder="Username" value={newUsername} autoComplete="off"
                            onChange={(e) => setNewUsername(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg text-sm"
                            style={{ background: '#f5f6f6', border: '1px solid #e6e9e8', color: '#14201f' }} />
                        <input type="password" placeholder="Password" value={newUserPassword} autoComplete="new-password"
                            onChange={(e) => setNewUserPassword(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg text-sm"
                            style={{ background: '#f5f6f6', border: '1px solid #e6e9e8', color: '#14201f' }} />
                        <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'viewer')}
                            className="w-full px-4 py-2 rounded-lg text-sm"
                            style={{ background: '#f5f6f6', border: '1px solid #e6e9e8', color: '#14201f' }}>
                            <option value="viewer">Viewer</option>
                            <option value="admin">Admin</option>
                        </select>

                        <p className="text-[11px]" style={{ color: '#b6bacb' }}>
                            At least 12 characters, with an uppercase letter, a lowercase letter, a digit, and a special character.
                        </p>

                        {cuError && (
                            <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#fdecec', color: '#b42318' }}>
                                {cuError}
                                {cuDetails.length > 0 && (
                                    <ul className="list-disc pl-4 mt-1 space-y-0.5">
                                        {cuDetails.map((d) => <li key={d}>{d}</li>)}
                                    </ul>
                                )}
                            </div>
                        )}
                        {cuSuccess && (
                            <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#e8f6ee', color: '#0a7a41' }}>
                                {cuSuccess}
                            </div>
                        )}

                        <button type="button" onClick={handleCreateUser} disabled={cuLoading}
                            className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-50"
                            style={{ background: 'var(--accent-primary)' }}>
                            {cuLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            {cuLoading ? 'Creating…' : 'Create User'}
                        </button>
                    </div>
                </GlassCard>
            )}
        </div>
    )
}
