import { motion } from "framer-motion"
import { useEffect, useRef } from "react"

interface WaveformVisualizerProps {
    isActive: boolean
    volume: number
}

const BAR_COUNT = 24

// Each bar gets a slightly different animation speed for organic look
const barConfigs = Array.from({ length: BAR_COUNT }, (_, i) => ({
    speed: 0.4 + Math.random() * 0.8,
    phase: Math.random() * Math.PI * 2,
    amplitude: 0.5 + (1 - Math.abs(i - BAR_COUNT / 2) / (BAR_COUNT / 2)) * 0.5,
}))

export function WaveformVisualizer({ isActive, volume }: WaveformVisualizerProps) {
    const frameRef = useRef<number>(0)
    const barsRef = useRef<(HTMLDivElement | null)[]>([])
    const timeRef = useRef(0)

    useEffect(() => {
        if (!isActive) {
            // Reset all bars to min height
            barsRef.current.forEach(bar => {
                if (bar) bar.style.height = "4px"
            })
            return
        }

        const animate = (timestamp: number) => {
            timeRef.current = timestamp / 1000

            barsRef.current.forEach((bar, i) => {
                if (!bar) return
                const cfg = barConfigs[i]
                // Sine wave at bar's own speed and phase
                const wave = Math.sin(timeRef.current * cfg.speed * 3 + cfg.phase)
                // volume boosts the amplitude (volume=0 → gentle idle, volume>0 → bigger)
                const boost = Math.min(volume * 20, 1)
                const amplitude = cfg.amplitude * (0.3 + boost * 0.7)
                const height = 4 + amplitude * (wave * 0.5 + 0.5) * 60
                bar.style.height = `${Math.max(4, height)}px`
            })

            frameRef.current = requestAnimationFrame(animate)
        }

        frameRef.current = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(frameRef.current)
    }, [isActive, volume])

    return (
        <div
            role="img"
            aria-label={isActive ? "Voice input active" : "Voice input inactive"}
            className="flex h-20 items-end justify-center gap-1"
        >
            {Array.from({ length: BAR_COUNT }).map((_, i) => (
                <div
                    key={i}
                    ref={el => { barsRef.current[i] = el }}
                    className="w-1.5 rounded-full bg-primary transition-none"
                    style={{ height: "4px" }}
                    aria-hidden="true"
                />
            ))}
        </div>
    )
}
