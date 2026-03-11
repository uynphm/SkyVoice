import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SeatOverlayProps {
    highlightedSeats: string[]
    selectedSeat: string | null
}

export function SeatOverlay({ highlightedSeats, selectedSeat }: SeatOverlayProps) {
    const hasInfo = selectedSeat !== null || highlightedSeats.length > 0

    return (
        <AnimatePresence>
            {hasInfo && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mx-4 mt-2 overflow-hidden"
                >
                    <div className={cn(
                        'flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold',
                        selectedSeat
                            ? 'border-green-500/40 bg-green-500/10 text-green-400'
                            : 'border-yellow-400/40 bg-yellow-400/10 text-yellow-300'
                    )}>
                        {selectedSeat ? (
                            <>
                                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                                <span>Ghế đã chọn: <strong>{selectedSeat}</strong></span>
                            </>
                        ) : (
                            <>
                                <Sparkles className="h-4 w-4 flex-shrink-0" />
                                <span>AI đề xuất: <strong>{highlightedSeats.join(', ')}</strong></span>
                            </>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}