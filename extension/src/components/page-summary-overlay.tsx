import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Volume2, X } from 'lucide-react'

interface PageSummaryOverlayProps {
    summary: string | null
    onClose: () => void
}

export function PageSummaryOverlay({ summary, onClose }: PageSummaryOverlayProps) {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        if (summary) {
            setVisible(true)
            const t = setTimeout(() => {
                setVisible(false)
                setTimeout(onClose, 300)
            }, 10000)
            return () => clearTimeout(t)
        }
    }, [summary, onClose])

    const handleClose = () => {
        setVisible(false)
        setTimeout(onClose, 300)
    }

    return (
        <AnimatePresence>
            {visible && summary && (
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 16 }}
                    transition={{ duration: 0.25 }}
                    className="absolute bottom-20 left-4 right-4 z-50 rounded-xl border-2 border-yellow-400/60 bg-[#121216] p-4 shadow-2xl"
                >
                    <div className="flex items-start gap-3">
                        <Volume2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-400" />
                        <p className="flex-1 text-sm leading-relaxed text-foreground">{summary}</p>
                        <button
                            onClick={handleClose}
                            className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    {/* Progress bar tự đóng sau 10s */}
                    <motion.div
                        className="mt-3 h-0.5 rounded-full bg-yellow-400/60"
                        initial={{ scaleX: 1 }}
                        animate={{ scaleX: 0 }}
                        transition={{ duration: 10, ease: 'linear' }}
                        style={{ originX: 0 }}
                    />
                </motion.div>
            )}
        </AnimatePresence>
    )
}