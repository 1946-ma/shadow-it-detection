'use client'
import { useEffect, useRef } from 'react'
import { animate } from 'framer-motion'

interface Props {
    value: number
    className?: string
}

export default function AnimatedCounter({ value, className }: Props) {
    const ref = useRef<HTMLSpanElement>(null)

    useEffect(() => {
        const node = ref.current
        if (!node) return
        const controls = animate(0, value, {
            duration: 1.2,
            ease: 'easeOut',
            onUpdate(v) { node.textContent = Math.round(v).toString() }
        })
        return () => controls.stop()
    }, [value])

    return <span ref={ref} className={className}>0</span>
}
