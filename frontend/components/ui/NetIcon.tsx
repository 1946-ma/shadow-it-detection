'use client'

/**
 * FishNet brand mark — a diamond mesh (fishing net). Drawn with `currentColor`
 * so it inherits the surrounding text color like a lucide icon; size via the
 * className (e.g. `w-5 h-5 text-white`).
 */
export function NetIcon({ className = '' }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            {/* two families of diagonals → a woven diamond net */}
            <path d="M2 8 L16 22 M2 2 L22 22 M8 2 L22 16 M8 22 L22 8 M2 22 L22 2 M2 16 L16 2" />
        </svg>
    )
}

export default NetIcon
