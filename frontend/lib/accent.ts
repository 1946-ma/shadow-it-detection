// Accent theming — a small set of preset accents that recolor the whole app by
// overriding four CSS variables (--accent-primary / --accent-glow / --accent-rgb
// / --accent-tint) on the document root. The choice is persisted per-browser in
// localStorage as resolved values, so the pre-hydration script in app/layout.tsx
// can apply it before paint without importing this module.

export type Accent = {
    id: string
    name: string
    primary: string // base accent (was hardcoded #2a7477)
    glow: string    // lighter partner for gradients (was #4a9ea1)
    rgb: string     // "r, g, b" of primary, for rgba(var(--accent-rgb), X) overlays
    tint: string    // very light background tint (was #e2efef)
}

// Teal first = the current default. Each preset ships tuned shades so every
// option looks polished (no runtime color math).
export const ACCENTS: Accent[] = [
    { id: 'teal',    name: 'Teal',    primary: '#2a7477', glow: '#4a9ea1', rgb: '42, 116, 119',  tint: '#e2efef' },
    { id: 'blue',    name: 'Blue',    primary: '#2563eb', glow: '#60a5fa', rgb: '37, 99, 235',   tint: '#e4ecfd' },
    { id: 'violet',  name: 'Violet',  primary: '#7c3aed', glow: '#a78bfa', rgb: '124, 58, 237',  tint: '#ece5fd' },
    { id: 'emerald', name: 'Emerald', primary: '#059669', glow: '#34d399', rgb: '5, 150, 105',   tint: '#daf3ea' },
    { id: 'rose',    name: 'Rose',    primary: '#e11d48', glow: '#fb7185', rgb: '225, 29, 72',    tint: '#fde3e8' },
    { id: 'amber',   name: 'Amber',   primary: '#c2610c', glow: '#f59e0b', rgb: '194, 97, 12',    tint: '#fbeed6' },
]

export const DEFAULT_ACCENT = ACCENTS[0]
export const ACCENT_STORAGE_KEY = 'wk-accent'

type StoredAccent = Pick<Accent, 'primary' | 'glow' | 'rgb' | 'tint'>

/** Set the four CSS variables on the document root. */
export function applyAccentVars(a: StoredAccent): void {
    if (typeof document === 'undefined') return
    const s = document.documentElement.style
    s.setProperty('--accent-primary', a.primary)
    s.setProperty('--accent-glow', a.glow)
    s.setProperty('--accent-rgb', a.rgb)
    s.setProperty('--accent-tint', a.tint)
}

/** Apply an accent and persist it (resolved values) for the pre-hydration script. */
export function applyAccent(a: Accent): void {
    applyAccentVars(a)
    try {
        const stored: StoredAccent = { primary: a.primary, glow: a.glow, rgb: a.rgb, tint: a.tint }
        localStorage.setItem(ACCENT_STORAGE_KEY, JSON.stringify(stored))
    } catch {
        /* storage unavailable — accent still applies for this session */
    }
}

/** Read the saved accent's resolved values, or null if none/invalid. */
export function readSavedAccent(): StoredAccent | null {
    try {
        const raw = localStorage.getItem(ACCENT_STORAGE_KEY)
        if (!raw) return null
        const a = JSON.parse(raw)
        if (a && a.primary && a.glow && a.rgb && a.tint) return a as StoredAccent
    } catch {
        /* ignore */
    }
    return null
}

/** The preset whose primary matches the saved accent, else the default. */
export function activeAccent(): Accent {
    const saved = readSavedAccent()
    if (!saved) return DEFAULT_ACCENT
    return ACCENTS.find((a) => a.primary.toLowerCase() === saved.primary.toLowerCase()) ?? DEFAULT_ACCENT
}
