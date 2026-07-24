'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Send, Loader2, User, ShieldCheck, Trash2, Plus, MessageSquare } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import GlassCard from '@/components/ui/GlassCard'
import { assistantApi, apiErrorMessage } from '@/lib/api'
import { isAdmin } from '@/lib/auth'
import type { AssistantResponse } from '@/lib/types'

const WK = { indigo: '#2a7477', ink: '#14201f', muted: '#7c8b89', line: '#e6e9e8' }

type Msg = { role: 'user' | 'assistant'; text: string; tools?: string[] }
type Conversation = { id: string; title: string; messages: Msg[]; updatedAt: number }

const STORE_KEY = 'assistant_conversations'

const EXAMPLES = [
    'How many high-risk unresolved detections are there?',
    'Which services/apps are contacted most often?',
    'Start a live network scan and tell me the status.',
    'Analyse the live traffic now and report any new anomalies.',
]

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

function ago(ts: number) {
    const s = Math.floor((Date.now() - ts) / 1000)
    if (s < 60) return 'just now'
    const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
}

export default function AssistantPage() {
    const router = useRouter()
    useEffect(() => { if (!isAdmin()) router.push('/dashboard') }, [router])

    const [conversations, setConversations] = useState<Conversation[]>([])
    const [activeId, setActiveId] = useState<string | null>(null)
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [hydrated, setHydrated] = useState(false)
    const endRef = useRef<HTMLDivElement | null>(null)

    // Restore saved conversations on mount.
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORE_KEY)
            if (saved) {
                const parsed = JSON.parse(saved)
                if (Array.isArray(parsed) && parsed.length) {
                    setConversations(parsed)
                    setActiveId(parsed[0].id)
                }
            }
        } catch { /* ignore corrupt storage */ }
        setHydrated(true)
    }, [])

    // Persist after hydration (keep the 30 most-recent conversations).
    useEffect(() => {
        if (!hydrated) return
        try { localStorage.setItem(STORE_KEY, JSON.stringify(conversations.slice(0, 30))) } catch { /* quota */ }
    }, [conversations, hydrated])

    const active = conversations.find((c) => c.id === activeId) || null
    const messages = active?.messages ?? []

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

    const newChat = () => { setActiveId(null); setInput(''); setError('') }
    const selectChat = (id: string) => { setActiveId(id); setError('') }
    const deleteChat = (id: string) => {
        setConversations((prev) => {
            const next = prev.filter((c) => c.id !== id)
            if (id === activeId) setActiveId(next[0]?.id ?? null)
            return next
        })
    }

    async function send(question: string) {
        const q = question.trim()
        if (!q || loading) return
        setError(''); setInput('')

        // Capture prior turns (multi-turn memory) BEFORE mutating state.
        let convId = activeId
        const conv = convId ? conversations.find((c) => c.id === convId) : null
        const history = (conv?.messages ?? []).map((m) => ({ role: m.role, content: m.text }))
        const userMsg: Msg = { role: 'user', text: q }

        if (convId && conv) {
            setConversations((prev) => prev.map((c) =>
                c.id === convId ? { ...c, messages: [...c.messages, userMsg], updatedAt: Date.now() } : c))
        } else {
            convId = uid()
            const created: Conversation = { id: convId, title: q.slice(0, 48), messages: [userMsg], updatedAt: Date.now() }
            setConversations((prev) => [created, ...prev])
            setActiveId(convId)
        }

        setLoading(true)
        try {
            const res = await assistantApi.ask(q, history)
            const data = res.data as AssistantResponse
            const asstMsg: Msg = { role: 'assistant', text: data.answer, tools: data.tools_used }
            setConversations((prev) => prev.map((c) =>
                c.id === convId ? { ...c, messages: [...c.messages, asstMsg], updatedAt: Date.now() } : c))
        } catch (e) {
            setError(apiErrorMessage(e, 'The assistant could not answer that.'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-5">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                    <Sparkles className="w-8 h-8" style={{ color: WK.indigo }} />
                    AI Assistant
                </h1>
                <p className="text-sm mt-1" style={{ color: WK.muted }}>
                    Ask about your Shadow IT detections in plain English. Monitors &amp; controls live capture; audited — but never changes stored data.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[248px_1fr] gap-4 items-start">
                {/* ── Chat history ── */}
                <GlassCard className="p-3">
                    <button onClick={newChat}
                        className="w-full mb-2 px-3 py-2.5 rounded-xl text-white text-sm font-medium flex items-center justify-center gap-2 transition-all"
                        style={{ background: WK.indigo }}>
                        <Plus className="w-4 h-4" /> New chat
                    </button>
                    <p className="px-1 pt-1 pb-2 text-[10px] uppercase tracking-wide font-semibold" style={{ color: WK.muted }}>
                        History
                    </p>
                    <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: '46vh' }}>
                        {conversations.length === 0 && (
                            <p className="px-2 py-3 text-xs" style={{ color: WK.muted }}>No saved chats yet.</p>
                        )}
                        {conversations.map((c) => {
                            const isActive = c.id === activeId
                            return (
                                <div key={c.id}
                                    className="group flex items-center gap-1 rounded-lg pr-1 cursor-pointer transition-colors"
                                    style={{ background: isActive ? 'rgba(42,116,119,0.10)' : 'transparent' }}
                                    onClick={() => selectChat(c.id)}
                                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = '#fafbfb' }}
                                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
                                    <div className="flex items-center gap-2 min-w-0 flex-1 px-2 py-2">
                                        <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isActive ? WK.indigo : WK.muted }} />
                                        <span className="min-w-0">
                                            <span className="block text-xs font-medium truncate" style={{ color: isActive ? WK.ink : '#374151' }}>{c.title || 'New chat'}</span>
                                            <span className="block text-[10px]" style={{ color: WK.muted }}>{ago(c.updatedAt)}</span>
                                        </span>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); deleteChat(c.id) }}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md flex-shrink-0 transition-opacity"
                                        style={{ color: WK.muted }} title="Delete chat"
                                        onMouseEnter={(e) => { e.currentTarget.style.color = '#1c2624' }}
                                        onMouseLeave={(e) => { e.currentTarget.style.color = WK.muted }}>
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                </GlassCard>

                {/* ── Chat ── */}
                <GlassCard className="p-0 overflow-hidden flex flex-col">
                    <div className="p-6 space-y-4 overflow-y-auto" style={{ minHeight: '46vh', maxHeight: '60vh' }}>
                        {messages.length === 0 && !loading && (
                            <div className="text-center py-8">
                                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4" style={{ background: 'rgba(42,116,119,0.10)' }}>
                                    <Sparkles className="w-7 h-7" style={{ color: WK.indigo }} />
                                </div>
                                <p className="text-sm mb-4" style={{ color: WK.muted }}>Ask a question, or try one of these:</p>
                                <div className="flex flex-wrap gap-2 justify-center max-w-2xl mx-auto">
                                    {EXAMPLES.map((ex) => (
                                        <button key={ex} onClick={() => send(ex)}
                                            className="text-xs px-3 py-2 rounded-lg border transition-colors"
                                            style={{ borderColor: WK.line, color: WK.ink, background: '#fff' }}
                                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(42,116,119,0.06)' }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}>
                                            {ex}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {messages.map((m, i) => (
                            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white"
                                    style={{ background: m.role === 'user' ? WK.ink : WK.indigo }}>
                                    {m.role === 'user' ? <User className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                                </div>
                                <div className={`${m.role === 'user' ? 'max-w-[80%]' : 'max-w-[88%]'} rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === 'user' ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
                                    style={m.role === 'user'
                                        ? { background: WK.indigo, color: '#fff' }
                                        : { background: '#ffffff', color: WK.ink, border: `1px solid ${WK.line}` }}>
                                    {m.role === 'user'
                                        ? <p className="whitespace-pre-wrap">{m.text}</p>
                                        : <div className="md-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown></div>}
                                    {m.tools && m.tools.length > 0 && (
                                        <p className="mt-2 text-[10px] uppercase tracking-wide" style={{ color: WK.muted }}>
                                            via {m.tools.join(', ')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ background: WK.indigo }}>
                                    <ShieldCheck className="w-4 h-4" />
                                </div>
                                <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm flex items-center gap-2" style={{ background: '#f5f6f6', color: WK.muted, border: `1px solid ${WK.line}` }}>
                                    <Loader2 className="w-4 h-4 animate-spin" /> Querying the detections database…
                                </div>
                            </div>
                        )}
                        <div ref={endRef} />
                    </div>

                    {error && <div className="mx-6 mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-500">{error}</div>}

                    <div className="p-4 border-t flex items-end gap-2" style={{ borderColor: WK.line, background: '#fff' }}>
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
                            rows={1}
                            placeholder="Ask about your detections… (Enter to send, Shift+Enter for a new line)"
                            className="flex-1 resize-none px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2"
                            style={{ background: '#f8fafc', border: `1.5px solid ${WK.line}`, color: WK.ink }}
                        />
                        <button onClick={() => send(input)} disabled={loading || !input.trim()}
                            className="px-4 py-2.5 rounded-xl text-white text-sm font-medium flex items-center gap-2 disabled:opacity-50 transition-all"
                            style={{ background: WK.indigo }}>
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Ask
                        </button>
                    </div>
                </GlassCard>
            </div>

            <p className="text-xs" style={{ color: WK.muted }}>
                Conversations are saved in your browser. Answers come from live queries and (on request) live capture control. Recommendations are advisory — you decide and act. Every question is recorded in the immutable audit trail.
            </p>
        </div>
    )
}
