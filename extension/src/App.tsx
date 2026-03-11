"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { StatusBanner, type AIState } from "@/components/status-banner"
import { WaveformVisualizer } from "@/components/waveform-visualizer"
import { SeatOverlay } from "@/components/seat-overlay"
import { PageSummaryOverlay } from "@/components/page-summary-overlay"
import { useAudioStreaming } from "@/hooks/use-audio-streaming"
import { Plane, ArrowRight, User, Cpu, Mic } from "lucide-react"
import { cn } from "@/lib/utils"

interface Message {
    id?: string
    role: 'USER' | 'ASSISTANT'
    text: string
    timestamp: string
}

export default function App() {
    const [aiState, setAiState]               = useState<AIState>("IDLE")
    const [messages, setMessages]             = useState<Message[]>([])
    const [hasStarted, setHasStarted]         = useState(false)
    const [highlightedSeats, setHighlighted]  = useState<string[]>([])
    const [selectedSeat, setSelectedSeat]     = useState<string | null>(null)
    const [pageSummary, setPageSummary]       = useState<string | null>(null)
    const chatEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        try { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) } catch (_) {}
    }, [messages])

    const onTranscript = useCallback((data: any) => {
        if (data?.text && data.final) {
            setMessages(prev => {
                if (data.id && prev.some(m => m.id === data.id)) {
                    return prev.map(m => m.id === data.id ? { ...m, text: data.text } : m)
                }
                return [...prev, {
                    id: data.id,
                    role: data.role === 'ASSISTANT' ? 'ASSISTANT' : 'USER',
                    text: data.text,
                    timestamp: new Date().toLocaleTimeString()
                }]
            })
        }
    }, [])

    const onHistory = useCallback((history: any[]) => {
        if (!Array.isArray(history)) return
        const formatted = history
            .filter(h => h?.role !== 'SYSTEM')
            .map(h => ({
                role: (h.role === 'ASSISTANT' ? 'ASSISTANT' : 'USER') as 'USER' | 'ASSISTANT',
                text: h.text || '',
                timestamp: h.timestamp
                    ? new Date(h.timestamp).toLocaleTimeString()
                    : new Date().toLocaleTimeString()
            }))
        setMessages(formatted)
        if (formatted.length > 0) setHasStarted(true)
    }, [])

    // Nhận UI action từ AI JSON → cập nhật overlays
    const onUIAction = useCallback((action: any) => {
        if (!action?.intent) return
        switch (action.intent) {
            case 'select_seat':
                if (action.data?.seat_id) {
                    setSelectedSeat(action.data.seat_id)
                    setHighlighted([])
                }
                break
            case 'ask_preference':
                if (action.data?.seat_ids?.length) setHighlighted(action.data.seat_ids)
                break
            case 'confirm_selection':
            case 'navigate':
                setSelectedSeat(null); setHighlighted([])
                break
            case 'summarize':
                setPageSummary(action.data?.page_summary || action.speech || null)
                break
        }
    }, [])

    const { isListening, toggleStreaming, volume, chromeId } = useAudioStreaming({
        onTranscript,
        onAIStateChange: setAiState,
        onHistory,
        onUIAction,
    })

    const startSession = () => {
        setHasStarted(true)
        if (!isListening) toggleStreaming()
    }

    const displayId = (chromeId || 'anonymous').toString().slice(0, 8)

    if (!hasStarted) {
        return (
            <main className="w-[500px] h-[680px] bg-[#0a0a0c] flex items-center justify-center">
                <div className="flex h-full w-full flex-col overflow-hidden bg-[#121216]">
                    <div className="relative h-48 w-full bg-gradient-to-br from-blue-600 to-indigo-900 px-8 pt-12">
                        <Plane className="absolute right-8 top-12 h-24 w-24 text-white/10 rotate-12" />
                        <h1 className="text-3xl font-bold text-white">SkyVoice</h1>
                        <p className="mt-1 text-sm text-blue-200">Voice-Powered Flight Assistant</p>
                    </div>
                    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8">
                        <p className="text-center text-base text-muted-foreground">
                            Your AI-powered seat selection assistant. Just speak naturally.
                        </p>
                        <button
                            onClick={startSession}
                            className="flex items-center gap-3 rounded-xl bg-primary px-8 py-4 text-lg font-bold text-primary-foreground transition-opacity hover:opacity-90"
                        >
                            <Mic className="h-5 w-5" />
                            Start Session
                            <ArrowRight className="h-5 w-5" />
                        </button>
                        <p className="text-xs text-muted-foreground">ID: {displayId}</p>
                    </div>
                </div>
            </main>
        )
    }

    return (
        <main className="relative w-[500px] h-[680px] bg-[#0a0a0c] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                    <Plane className="h-5 w-5 text-primary" />
                    <span className="font-bold text-foreground">SkyVoice</span>
                </div>
                <StatusBanner state={aiState} />
                <span className="text-xs text-muted-foreground">#{displayId}</span>
            </div>

            {/* Seat Overlay Badge */}
            <SeatOverlay highlightedSeats={highlightedSeats} selectedSeat={selectedSeat} />

            {/* Waveform */}
            <div className="px-6 pt-3">
                <WaveformVisualizer isActive={isListening} volume={volume} />
            </div>

            {/* Chat */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
                {messages.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground mt-8">
                        Press the mic and start speaking…
                    </p>
                )}
                {messages.map((msg, i) => (
                    <div key={msg.id || i} className={cn('flex gap-2', msg.role === 'USER' ? 'justify-end' : 'justify-start')}>
                        {msg.role === 'ASSISTANT' && <Cpu className="h-4 w-4 mt-1 text-primary flex-shrink-0" />}
                        <div className={cn(
                            'max-w-[80%] rounded-2xl px-4 py-2 text-sm',
                            msg.role === 'USER'
                                ? 'bg-primary text-primary-foreground rounded-br-sm'
                                : 'bg-secondary text-foreground rounded-bl-sm'
                        )}>
                            <p>{msg.text}</p>
                            <p className="text-[10px] opacity-50 mt-1">{msg.timestamp}</p>
                        </div>
                        {msg.role === 'USER' && <User className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />}
                    </div>
                ))}
                <div ref={chatEndRef} />
            </div>

            {/* Mic Button */}
            <div className="border-t border-border px-4 py-3 flex items-center justify-center">
                <button
                    onClick={toggleStreaming}
                    className={cn(
                        'flex items-center gap-2 rounded-full px-6 py-3 font-bold text-sm transition-all',
                        isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-primary text-primary-foreground'
                    )}
                >
                    <Mic className="h-4 w-4" />
                    {isListening ? 'Stop' : 'Speak'}
                </button>
            </div>

            {/* Page Summary Overlay */}
            <PageSummaryOverlay summary={pageSummary} onClose={() => setPageSummary(null)} />
        </main>
    )
}