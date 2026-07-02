'use client'

interface LogoProps {
    size?: number
    className?: string
    /** 'full' shows icon + wordmark, 'icon' shows icon only */
    variant?: 'full' | 'icon'
}

export function Logo({ size = 36, className = '', variant = 'icon' }: LogoProps) {
    return (
        <div className={`flex items-center gap-2.5 ${className}`}>
            {/* Icon mark — Isolation-Forest binary tree with anomalous red node */}
            <svg
                width={size}
                height={size}
                viewBox="0 0 40 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-label="SentinelAI logo"
            >
                {/* Background tile */}
                <rect width="40" height="40" rx="10" fill="rgba(59,130,246,0.15)" />
                <rect width="40" height="40" rx="10" stroke="rgba(59,130,246,0.45)" strokeWidth="1.2" fill="none" />

                {/* Root node */}
                <circle cx="20" cy="9" r="2.8" fill="#60a5fa" />

                {/* Level-1 edges */}
                <line x1="20" y1="9" x2="11" y2="20" stroke="#3b82f6" strokeWidth="1.4" strokeLinecap="round" />
                <line x1="20" y1="9" x2="29" y2="20" stroke="#3b82f6" strokeWidth="1.4" strokeLinecap="round" />

                {/* Level-1 nodes — left is anomalous (red) */}
                <circle cx="11" cy="20" r="2.8" fill="#ef4444" />
                <circle cx="29" cy="20" r="2.8" fill="#60a5fa" />

                {/* Anomaly ring pulse — static representation */}
                <circle cx="11" cy="20" r="5.5" stroke="#ef4444" strokeWidth="1" fill="none" opacity="0.4" />
                <circle cx="11" cy="20" r="7.5" stroke="#ef4444" strokeWidth="0.6" fill="none" opacity="0.15" />

                {/* Level-2 edges */}
                <line x1="11" y1="20" x2="7" y2="30" stroke="#3b82f6" strokeWidth="1" strokeLinecap="round" />
                <line x1="11" y1="20" x2="15" y2="30" stroke="#3b82f6" strokeWidth="1" strokeLinecap="round" />
                <line x1="29" y1="20" x2="25" y2="30" stroke="#3b82f6" strokeWidth="1" strokeLinecap="round" />
                <line x1="29" y1="20" x2="33" y2="30" stroke="#3b82f6" strokeWidth="1" strokeLinecap="round" />

                {/* Level-2 nodes */}
                <circle cx="7" cy="30" r="2" fill="#60a5fa" opacity="0.7" />
                <circle cx="15" cy="30" r="2" fill="#60a5fa" opacity="0.7" />
                <circle cx="25" cy="30" r="2" fill="#60a5fa" opacity="0.7" />
                <circle cx="33" cy="30" r="2" fill="#60a5fa" opacity="0.7" />
            </svg>

            {variant === 'full' && (
                <div>
                    <p className="text-base font-bold text-slate-900 dark:text-white leading-tight tracking-tight">
                        Sentinel<span className="text-blue-500">AI</span>
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-500 leading-none tracking-wide uppercase">
                        Detection
                    </p>
                </div>
            )}
        </div>
    )
}
