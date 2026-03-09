"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { StatusBanner, type AIState } from "@/components/status-banner"
import { WaveformVisualizer } from "@/components/waveform-visualizer"
import { useAudioStreaming } from "@/hooks/use-audio-streaming"
import { Plane, MessageSquare, History, ArrowRight, User, Cpu, Mic } from "lucide-react"
import { cn } from "@/lib/utils"

interface Message {
    role: 'USER' | 'ASSISTANT';
    text: string;
    timestamp: string;
}

export default function App() {
    const [aiState, setAiState] = useState<AIState>("IDLE")
    const [messages, setMessages] = useState<Message[]>([])
    const [hasStarted, setHasStarted] = useState(false)
    const chatEndRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = () => {
        try {
            chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
        } catch (e) { }
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    const onTranscript = useCallback((data: any) => {
        if (data && data.text) {
            if (data.final) {
                setMessages(prev => [...prev, {
                    role: data.role === 'ASSISTANT' ? 'ASSISTANT' : 'USER',
                    text: data.text,
                    timestamp: new Date().toLocaleTimeString()
                }])
            }
        }
    }, [])

    const onHistory = useCallback((history: any[]) => {
        if (!Array.isArray(history)) return
        const formatted = history.filter(h => h && h.role !== 'SYSTEM').map(h => ({
            role: (h.role === 'ASSISTANT' ? 'ASSISTANT' : 'USER') as 'USER' | 'ASSISTANT',
            text: h.text || "",
            timestamp: h.timestamp ? new Date(h.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()
        }))
        setMessages(formatted)
        if (formatted.length > 0) setHasStarted(true)
    }, [])

    const {
        isListening,
        toggleStreaming,
        volume,
        chromeId
    } = useAudioStreaming({
        onTranscript,
        onAIStateChange: (state) => setAiState(state),
        onHistory
    })

    const startSession = () => {
        setHasStarted(true)
        if (!isListening) {
            toggleStreaming()
        }
    }

    // Safety check for display ID
    const displayId = (chromeId || "anonymous").toString().slice(0, 8)

    if (!hasStarted) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-[#0a0a0c] p-4">
                <div className="w-full max-w-[420px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#121216] shadow-2xl">
                    <div className="relative h-48 w-full bg-gradient-to-br from-blue-600 to-indigo-900 px-8 pt-12">
                        <Plane className="absolute right-8 top-12 h-24 w-24 text-white/10 rotate-12" />
                        <h1 className="text-4xl font-bold text-white tracking-tight font-sans">SkyVoice</h1>
                        <p className="text-blue-100/80 mt-2 font-medium font-sans">Your personal sky concierge.</p>
                    </div>

                    <div className="p-8 space-y-8">
                        <div className="space-y-4">
                            <h2 className="text-xl font-semibold text-white font-sans">Welcome back</h2>
                            <p className="text-gray-400 text-sm leading-relaxed font-sans">
                                I'm ready to help you find the perfect seat. We can continue where we left off or start a fresh trip.
                            </p>
                        </div>

                        <div className="space-y-3 pt-4">
                            <button
                                onClick={startSession}
                                className="group flex w-full items-center justify-between rounded-2xl bg-white px-6 py-5 font-bold text-black transition-all hover:bg-blue-50 active:scale-95 shadow-xl shadow-white/5"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                                        <Mic className="h-6 w-6" />
                                    </div>
                                    <span className="font-sans">Start Voice Agent</span>
                                </div>
                                <ArrowRight className="h-5 w-5 text-black/30 group-hover:translate-x-1 transition-transform" />
                            </button>

                            <button
                                onClick={() => setHasStarted(true)}
                                className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 font-bold text-white transition-all hover:bg-white/10 active:scale-95"
                            >
                                <History className="h-5 w-5" />
                                <span className="font-sans">Resume Last Trip</span>
                            </button>
                        </div>

                        <div className="flex items-center justify-center gap-2 pt-4">
                            <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold font-sans">System Online • {displayId}</span>
                        </div>
                    </div>
                </div>
            </main>
        )
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-[#0a0a0c] p-4">
            <div className="flex h-[700px] w-full max-w-[450px] flex-col overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#121216] shadow-2xl">
                {/* Header */}
                <header className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-6 py-5 backdrop-blur-md">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
                            <Plane className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-white tracking-tight font-sans">SkyVoice Agent</h2>
                            <div className="flex items-center gap-1.5">
                                <div className={cn("h-1.5 w-1.5 rounded-full", isListening ? "bg-green-500 animate-pulse" : "bg-gray-500")} />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 font-sans">
                                    {aiState}
                                </span>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Chat Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-4 px-8">
                            <div className="h-16 w-16 rounded-full bg-white/5 flex items-center justify-center">
                                <MessageSquare className="h-8 w-8 text-white/20" />
                            </div>
                            <p className="text-gray-500 text-sm font-sans">No messages yet. Try saying "I'm looking for a window seat."</p>
                        </div>
                    )}

                    {messages.map((msg, i) => (
                        <div
                            key={i}
                            className={cn(
                                "flex w-full items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300",
                                msg.role === 'USER' ? "flex-row-reverse" : "flex-row"
                            )}
                        >
                            <div className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                                msg.role === 'USER' ? "border-blue-500/30 bg-blue-500/10 text-blue-400" : "border-white/10 bg-white/5 text-gray-400"
                            )}>
                                {msg.role === 'USER' ? <User className="h-4 w-4" /> : <Cpu className="h-4 w-4" />}
                            </div>
                            <div className={cn(
                                "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm font-sans",
                                msg.role === 'USER'
                                    ? "bg-blue-600 text-white rounded-tr-none shadow-blue-500/10"
                                    : "bg-black text-gray-200 border border-white/10 rounded-tl-none shadow-black/40"
                            )}>
                                {msg.text}
                                <div className={cn(
                                    "mt-1.5 text-[9px] font-medium opacity-50",
                                    msg.role === 'USER' ? "text-right" : "text-left"
                                )}>
                                    {msg.timestamp}
                                </div>
                            </div>
                        </div>
                    ))}
                    <div ref={chatEndRef} />
                </div>

                {/* Footer Controls */}
                <footer className="border-t border-white/5 bg-white/[0.01] p-6 pb-8">
                    <div className="flex flex-col items-center gap-6">
                        <WaveformVisualizer isActive={isListening} volume={volume} />

                        <div className="flex w-full items-center justify-between gap-4">
                            <button
                                onClick={() => setHasStarted(false)}
                                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-gray-400 hover:bg-white/10 transition-colors font-sans"
                            >
                                Stop Session
                            </button>

                            <div className="flex-1 text-center">
                                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest leading-none font-sans">
                                    {isListening ? "Listening..." : "Paused"}
                                </p>
                            </div>

                            <div className="w-[88px]" />
                        </div>
                    </div>
                </footer>
            </div>
        </main>
    )
}
