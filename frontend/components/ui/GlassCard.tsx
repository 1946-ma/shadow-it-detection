'use client'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface Props {
    className?: string
    children: React.ReactNode
    onClick?: () => void
}

export default function GlassCard({ className, children, onClick }: Props) {
    return (
        <motion.div
            whileHover={{ scale: 1.01 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={onClick}
            className={cn('glass', className)}
        >
            {children}
        </motion.div>
    )
}
