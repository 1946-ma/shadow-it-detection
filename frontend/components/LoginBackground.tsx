'use client'
import { motion } from 'framer-motion'

/**
 * WINCK-style decorative canvas: playful geometric shapes scattered on the
 * deep-navy login backdrop. Purely decorative (pointer-events-none).
 */
export default function LoginBackground() {
    return (
        <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ background: 'var(--wk-navy-bg)' }}>
            {/* Coral rounded square — top left */}
            <motion.div
                className="absolute"
                style={{ width: 190, height: 190, borderRadius: 42, background: 'var(--wk-coral)', top: '-46px', left: '-30px', transform: 'rotate(12deg)' }}
                animate={{ y: [0, 16, 0] }}
                transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
            />
            {/* Periwinkle circle — top right */}
            <motion.div
                className="absolute rounded-full"
                style={{ width: 150, height: 150, background: 'var(--wk-peri)', top: '6%', right: '10%', opacity: 0.9 }}
                animate={{ y: [0, -18, 0] }}
                transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
            />
            {/* Gold circle — bottom center */}
            <motion.div
                className="absolute rounded-full"
                style={{ width: 220, height: 220, background: 'var(--wk-gold)', bottom: '-70px', left: '34%' }}
                animate={{ y: [0, 14, 0] }}
                transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
            />
            {/* Light-gold circle — bottom center-left */}
            <div className="absolute rounded-full" style={{ width: 150, height: 150, background: '#d8dddb', bottom: '-30px', left: '26%', opacity: 0.85 }} />
            {/* Coral blob — bottom right */}
            <motion.div
                className="absolute rounded-full"
                style={{ width: 260, height: 260, background: 'var(--wk-coral)', bottom: '-90px', right: '-70px', opacity: 0.85 }}
                animate={{ y: [0, -12, 0] }}
                transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
            />
            {/* Pink soft circle — right */}
            <div className="absolute rounded-full" style={{ width: 130, height: 130, background: 'var(--wk-pink)', bottom: '16%', right: '2%', opacity: 0.8 }} />
            {/* Indigo triangle — bottom left */}
            <motion.div
                className="absolute"
                style={{ width: 0, height: 0, borderLeft: '90px solid transparent', borderRight: '90px solid transparent', borderBottom: '150px solid var(--wk-indigo)', bottom: '4%', left: '4%' }}
                animate={{ rotate: [0, 8, 0] }}
                transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
            />
            {/* Small navy triangle accent — top center */}
            <div className="absolute" style={{ width: 0, height: 0, borderLeft: '26px solid transparent', borderRight: '26px solid transparent', borderTop: '44px solid #1a1f4a', top: '2%', left: '46%', opacity: 0.7 }} />
        </div>
    )
}
