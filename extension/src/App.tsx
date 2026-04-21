"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { StatusBanner, type AIState } from "@/components/status-banner"
import { WaveformVisualizer } from "@/components/waveform-visualizer"
import { useAudioStreaming } from "@/hooks/use-audio-streaming"
import { Plane, MessageSquare, History, ArrowRight, Mic } from "lucide-react"
import { cn } from "@/lib/utils"
import { MessageBubble } from "@/components/message-bubble"

interface Message {
    id?: string;
    role: 'USER' | 'ASSISTANT';
    text: string;
    timestamp: string;
}

export default function App() {
    const [aiState, setAiState] = useState<AIState>("IDLE")
    const [messages, setMessages] = useState<Message[]>([])
    const [hasStarted, setHasStarted] = useState(false)
    const [ticketResults, setTicketResults] = useState<any[]>([])
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
                setMessages(prev => {
                    const normalizedRole = typeof data.role === 'string' ? data.role.toUpperCase() : 'USER';
                    const isAI = normalizedRole === 'ASSISTANT';
                    const incomingRole = isAI ? 'ASSISTANT' as const : 'USER' as const;

                    // Update only when both id and role match (id+role key semantics).
                    if (data.id && prev.some(m => m.id === data.id && m.role === incomingRole)) {
                        return prev.map(m =>
                            m.id === data.id && m.role === incomingRole ? { ...m, text: data.text } : m
                        );
                    }

                    if (isAI && prev.length > 0) {
                        const last = prev[prev.length - 1];
                        if (last.role === 'ASSISTANT' && last.text === data.text) {
                            return prev;
                        }
                    }

                    return [...prev, {
                        id: data.id,
                        role: incomingRole,
                        text: data.text,
                        timestamp: new Date().toLocaleTimeString()
                    }];
                });
            }
        }
    }, [])

    const onTicketResults = useCallback((data: any) => {
        if (Array.isArray(data?.results)) setTicketResults(data.results)
    }, [])

    const onHistory = useCallback((history: any[]) => {
        if (!Array.isArray(history)) return
        const formatted = history
            .filter(h => h && String(h.role).toUpperCase() !== 'SYSTEM')
            .map(h => ({
                role: (String(h.role).toUpperCase() === 'ASSISTANT' ? 'ASSISTANT' : 'USER') as 'USER' | 'ASSISTANT',
                text: h.text || "",
                timestamp: h.timestamp ? new Date(h.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()
            }))
        setMessages(formatted)
        if (formatted.length > 0) setHasStarted(true)
    }, [])

    const {
        isListening,
        isSpeaking,
        toggleStreaming,
        volume,
        chromeId
    } = useAudioStreaming({
        onTranscript,
        onAIStateChange: (state) => setAiState(state),
        onHistory,
        onTicketResults,
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
            <main className="w-[500px] h-[680px] bg-[#0a0a0c] flex items-center justify-center">
                <div className="flex h-full w-full flex-col overflow-hidden bg-[#121216]">
                    <div className="relative h-48 w-full bg-gradient-to-br from-blue-600 to-indigo-900 px-8 pt-12">
                        <Plane className="absolute right-8 top-12 h-24 w-24 text-white/10 rotate-12" />
                        <h1 className="text-4xl font-bold text-white tracking-tight font-sans">SkyVoice</h1>
                        <p className="text-blue-100/80 mt-2 font-medium font-sans">Running everything at the sound of your voice.</p>
                    </div>

                    <div className="p-8 space-y-8">
                        <div className="space-y-4">
                            <h2 className="text-xl font-semibold text-white font-sans">Ready to navigate</h2>
                            <p className="text-gray-400 text-sm leading-relaxed font-sans">
                                I can help you navigate complex web pages — from booking seats and filtering results to filling forms and exploring any web UI, all hands-free.
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
                                <span className="font-sans">Resume Last Session</span>
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
        <main className="w-[500px] h-[590px] bg-[#0a0a0c] flex items-center justify-center">
            <div className="flex h-full w-full flex-col overflow-hidden bg-[#121216]">
                {/* Header */}
                <header className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-6 py-3 backdrop-blur-md">
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
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-4 px-8">
                            <div className="h-16 w-16 rounded-full bg-white/5 flex items-center justify-center">
                                <MessageSquare className="h-8 w-8 text-white/20" />
                            </div>
                            <p className="text-gray-500 text-sm font-sans">No messages yet. Try saying "Book me tickets for Taylor Swift next Saturday, 2 tickets, under $200, floor section."</p>
                        </div>
                    )}

                    {messages.map((msg, i) => (
                        <div
                            key={i}
                            className={cn(
                                "flex w-full animate-in fade-in slide-in-from-bottom-2 duration-300",
                                msg.role === 'USER' ? "justify-end" : "justify-start"
                            )}
                        >
                            <MessageBubble
                                role={msg.role}
                                text={msg.text}
                                timestamp={msg.timestamp}
                            />
                        </div>
                    ))}
                    {ticketResults.length > 0 && (
                        <div className="pt-2 pb-1 space-y-2">
                            <p className="text-xs font-bold uppercase tracking-widest text-gray-500 font-sans px-1">
                                Ticket Results
                            </p>
                            {ticketResults.map((result, i) => (
                                <div key={i} className="rounded-xl border border-white/10 bg-[#1a1a1e] p-4 space-y-1">
                                    <p className="text-sm font-bold text-white font-sans">{result.name}</p>
                                    <p className="text-xs text-gray-400 font-sans">{result.venue} · {result.city}</p>
                                    <p className="text-xs text-gray-500 font-sans">{result.date}</p>
                                    {(result.priceMin != null || result.priceMax != null) && (
                                        <p className="text-xs text-green-400 font-sans">
                                            ${result.priceMin ?? '?'} – ${result.priceMax ?? '?'}
                                        </p>
                                    )}
                                    {result.url && (
                                        <a
                                            href={result.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-2 inline-block rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500 transition-colors font-sans"
                                        >
                                            Buy Tickets
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                {/* Footer Controls */}
                <footer className="border-t border-white/5 bg-white/[0.01] p-4">
                    <div className="flex flex-col items-center gap-3">
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
                                    {!isListening ? "Paused" : isSpeaking ? "Speaking..." : "Listening..."}
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
