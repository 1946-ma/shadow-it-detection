'use client'
import { motion } from 'framer-motion'

export default function LoginBackground() {
    return (
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
            <motion.div
                className="absolute w-96 h-96 rounded-full opacity-20"
                style={{ background: 'radial-gradient(circle, #9d4edd, transparent)', top: '10%', left: '5%' }}
                animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
                transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
                className="absolute w-96 h-96 rounded-full opacity-15"
                style={{ background: 'radial-gradient(circle, #3a86ff, transparent)', bottom: '10%', right: '5%' }}
                animate={{ x: [0, -40, 0], y: [0, 30, 0] }}
                transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
            />
        </div>
    )
}
