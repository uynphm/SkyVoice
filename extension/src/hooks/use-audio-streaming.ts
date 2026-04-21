import { useState, useEffect, useRef, useCallback } from "react"
import io from "socket.io-client"
import { bufferToBase64 } from "@/lib/pcm-encoder"

type Socket = any

export type AIState = "IDLE" | "LISTENING" | "SPEAKING" | "THINKING" | "SEARCHING" | "RESULTS_READY"

interface UseAudioStreamingProps {
    onTranscript?: (data: any) => void
    onAIStateChange?: (state: AIState) => void
    onHistory?: (history: any[]) => void
    onTicketResults?: (data: any) => void
}

export function useAudioStreaming({ onTranscript, onAIStateChange, onHistory, onTicketResults }: UseAudioStreamingProps & { onHistory?: (h: any[]) => void } = {}) {
    const [isListening, setIsListening] = useState(false)
    const [sessionActive, setSessionActive] = useState(false)
    const [chromeId, setChromeId] = useState<string>("anonymous")
    const [socket, setSocket] = useState<Socket | null>(null)
    const [volume, setVolume] = useState(0)
    const [isSpeaking, setIsSpeaking] = useState(false)
    const audioContextRef = useRef<AudioContext | null>(null)
    const playbackContextRef = useRef<AudioContext | null>(null)
    const playbackWorkletRef = useRef<AudioWorkletNode | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const workletNodeRef = useRef<AudioWorkletNode | null>(null)
    const isActiveRef = useRef(false)
    const lastLogRef = useRef(0)

    const transcriptHandlerRef = useRef(onTranscript)
    const stateHandlerRef = useRef(onAIStateChange)
    const chromeIdRef = useRef("anonymous")

    useEffect(() => {
        transcriptHandlerRef.current = onTranscript
        stateHandlerRef.current = onAIStateChange
    }, [onTranscript, onAIStateChange])

    useEffect(() => {
        const id = localStorage.getItem('skyvoice_chrome_id') || `user_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('skyvoice_chrome_id', id);
        setChromeId(id);
        chromeIdRef.current = id;

        const backendUrl = ((window as any).__SKYVOICE_BACKEND_URL as string | undefined) || "http://localhost:5004"
        const newSocket = io(backendUrl, {
            auth: { chromeId: id },
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 800,
        })
        setSocket(newSocket)

        newSocket.on("connect", () => {
            console.log("%c[SOCKET] Connected to backend!", "color:green;font-weight:bold", newSocket.id)
            newSocket.emit("ping", (res: any) => {
                console.log("%c[SOCKET] Ping/Pong OK:", "color:green", res)
            })
        })

        newSocket.on("connect_error", (err: any) => {
            console.error("%c[SOCKET] Connection FAILED:", "color:red;font-weight:bold", err.message)
        })

        newSocket.on("transcript", (data: any) => {
            console.log("%c[SOCKET] Transcript received:", "color:orange", data)
            const transcript = typeof data === "string" ? data : data.text
            if (transcript !== undefined && transcript !== null) {
                transcriptHandlerRef.current?.({ ...data, text: transcript, id: data.id })
            }
        })

        newSocket.on("textOutput", (data: any) => {
            console.log("%c[SOCKET] Text output received:", "color:cyan", data)
            const text = data.content || data.text
            if (text) {
                const normalizedRole = typeof data.role === "string" ? data.role.toUpperCase() : "ASSISTANT"
                transcriptHandlerRef.current?.({
                    text,
                    id: data.id,
                    final: true,
                    role: normalizedRole
                })
            }
        })

        newSocket.on("toolUse", (data: any) => {
            if (data.toolName === "parseVoiceInteraction" || data.toolName === "parse_voice_interaction") {
                stateHandlerRef.current?.("THINKING")
            }
        })

        // --- TTS Audio Output Playback ---
        newSocket.on("audioOutput", (data: any) => {
            if (!playbackWorkletRef.current || !isActiveRef.current) return

            const pcmBase64: string | null = data.content || data.audio || data.bytes || (typeof data === 'string' ? data : null)
            if (!pcmBase64 || typeof pcmBase64 !== 'string') return

            try {
                const binary = atob(pcmBase64)
                const bytes = new Uint8Array(binary.length)
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
                const int16 = new Int16Array(bytes.buffer)
                const float32 = new Float32Array(int16.length)
                for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768

                playbackWorkletRef.current.port.postMessage({ type: "audio", audioData: float32 })
            } catch (err) {
                console.error("Error decoding audio chunk:", err)
            }
        })

        newSocket.on("contentStart", (data: any) => {
            if (data.type === "AUDIO" && data.role === "ASSISTANT") {
                setIsSpeaking(true)
                stateHandlerRef.current?.("SPEAKING")
            }
        })

        newSocket.on("contentEnd", (data: any) => {
            if (data.type === "AUDIO") {
                // AI audio block ended — state will flip to LISTENING once playback buffer drains
            }
            if (data.stopReason?.toUpperCase() === "INTERRUPTED") {
                bargeInRef.current?.()
            }
        })

        newSocket.on("toolResult", () => {
            stateHandlerRef.current?.("THINKING")
            setTimeout(() => {
                if (isActiveRef.current) stateHandlerRef.current?.("LISTENING")
                else stateHandlerRef.current?.("IDLE")
            }, 2000)
        })

        newSocket.on("ticketSearchStatus", (data: any) => {
            if (data?.status === 'searching') {
                stateHandlerRef.current?.("SEARCHING")
            } else if (data?.status === 'completed') {
                stateHandlerRef.current?.("RESULTS_READY")
                onTicketResults?.(data)
                setTimeout(() => {
                    if (isActiveRef.current) stateHandlerRef.current?.("LISTENING")
                    else stateHandlerRef.current?.("IDLE")
                }, 5000)
            } else if (data?.status === 'failed') {
                console.warn("[SOCKET] Ticket search failed:", data?.error)
                stateHandlerRef.current?.(isActiveRef.current ? "LISTENING" : "IDLE")
            }
        })

        newSocket.on("disconnect", () => {
            console.log("Socket disconnected")
            setIsListening(false)
            isActiveRef.current = false
        })

        newSocket.on("error", (err: any) => {
            console.warn("[SOCKET] Backend error:", err?.message || err)
            setIsListening(false)
            setVolume(0)
            isActiveRef.current = false
            stateHandlerRef.current?.("IDLE")
        })

        newSocket.on("streamComplete", () => {
            console.log("[SOCKET] Stream complete — session ended")
            setIsListening(false)
            setVolume(0)
            isActiveRef.current = false
            stateHandlerRef.current?.("IDLE")
        })

        newSocket.on("sessionHistory", (history: any[]) => {
            console.log("[SOCKET] Received session history:", history)
            onHistory?.(history)
        })

        return () => {
            newSocket.disconnect()
        }
    }, [])

    const bargeInRef = useRef<(() => void) | null>(null)

    const stopStreaming = useCallback(() => {
        isActiveRef.current = false

        if (workletNodeRef.current) {
            workletNodeRef.current.port.postMessage({ type: "stop" })
            workletNodeRef.current.disconnect()
            workletNodeRef.current = null
        }
        if (audioContextRef.current) {
            audioContextRef.current.close()
            audioContextRef.current = null
        }
        if (playbackWorkletRef.current) {
            playbackWorkletRef.current.disconnect()
            playbackWorkletRef.current = null
        }
        if (playbackContextRef.current) {
            playbackContextRef.current.close()
            playbackContextRef.current = null
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t: any) => t.stop())
            streamRef.current = null
        }
        if (socket) socket.emit("stopAudio")

        setIsListening(false)
        setIsSpeaking(false)
        setVolume(0)
        stateHandlerRef.current?.("IDLE")
    }, [socket])

    const startStreaming = useCallback(async () => {
        if (!socket) { console.error("No socket"); return }
        if (!socket.connected) {
            console.warn("[SOCKET] Not connected yet, waiting before start...")
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("Socket connect timeout")), 5000)
                socket.once("connect", () => {
                    clearTimeout(timeout)
                    resolve()
                })
                socket.connect()
            }).catch((err) => {
                console.error("[SOCKET] Cannot connect to backend:", err)
            })
            if (!socket.connected) return
        }

        try {
            // === STEP 1: Capture AudioContext (native sample rate for mic) ===
            const audioContext = new AudioContext()
            audioContextRef.current = audioContext

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            streamRef.current = stream

            console.log(`[AUDIO] Capture context at ${audioContext.sampleRate}Hz`)

            // === STEP 2: Playback AudioContext (24kHz for Sonic TTS) ===
            const playbackCtx = new AudioContext({ sampleRate: 24000 })
            playbackContextRef.current = playbackCtx

            await playbackCtx.audioWorklet.addModule("/audio-player-processor.js")
            const playbackNode = new AudioWorkletNode(playbackCtx, "audio-player-processor")
            playbackNode.connect(playbackCtx.destination)
            playbackWorkletRef.current = playbackNode

            playbackNode.port.onmessage = (e: MessageEvent) => {
                if (e.data.type === "playbackStart") {
                    setIsSpeaking(true)
                    stateHandlerRef.current?.("SPEAKING")
                } else if (e.data.type === "playbackEnd") {
                    setIsSpeaking(false)
                    if (isActiveRef.current) stateHandlerRef.current?.("LISTENING")
                }
            }

            bargeInRef.current = () => {
                playbackNode.port.postMessage({ type: "barge-in" })
                setIsSpeaking(false)
            }

            // === STEP 3: Backend init ===
            console.log("%c[MIC] Sending initializeConnection...", "color:blue;font-weight:bold")
            const initSuccess = await new Promise<boolean>((resolve) => {
                let settled = false
                const timer = setTimeout(() => {
                    if (!settled) {
                        settled = true
                        console.error("[MIC] initializeConnection TIMED OUT after 10s!")
                        resolve(false)
                    }
                }, 10000)
                socket.emit("initializeConnection", { chromeId: chromeIdRef.current }, (response: any) => {
                    if (!settled) {
                        settled = true
                        clearTimeout(timer)
                        console.log("%c[MIC] initializeConnection response:", "color:blue", response)
                        resolve(!!response?.success)
                    }
                })
            })

            if (!initSuccess) {
                console.error("Backend initialization failed")
                stream.getTracks().forEach((t: any) => t.stop())
                audioContext.close()
                playbackCtx.close()
                streamRef.current = null
                audioContextRef.current = null
                playbackContextRef.current = null
                playbackWorkletRef.current = null
                return
            }

            if (audioContext.state === "suspended") await audioContext.resume()
            if (playbackCtx.state === "suspended") await playbackCtx.resume()

            console.log(`[AUDIO] Capture: ${audioContext.sampleRate}Hz | Playback: ${playbackCtx.sampleRate}Hz`)

            // === STEP 4: Wire mic capture graph ===
            await audioContext.audioWorklet.addModule("/audio-processor.js")

            const source = audioContext.createMediaStreamSource(stream)
            const workletNode = new AudioWorkletNode(audioContext, "audio-capture-processor")
            workletNodeRef.current = workletNode
            isActiveRef.current = true

            workletNode.port.onmessage = (e: MessageEvent) => {
                if (!isActiveRef.current || !socket.connected) return

                if (e.data.type === "volume") {
                    setVolume(e.data.rms)

                    const now = Date.now()
                    if (now - lastLogRef.current > 1000) {
                        console.log(`AudioWorklet: RMS=${e.data.rms.toFixed(5)}, ctx=${audioContext.state}`)
                        lastLogRef.current = now
                    }
                } else if (e.data.type === "audio") {
                    const pcm = new Int16Array(e.data.pcmBuffer)
                    socket.emit("audioInput", bufferToBase64(pcm))
                } else if (e.data.type === "speechStart") {
                    console.log("%c[VAD] Speech started — barge-in", "color:lime;font-weight:bold")
                    setIsSpeaking(false)
                    bargeInRef.current?.()
                    stateHandlerRef.current?.("SPEAKING")
                } else if (e.data.type === "speechEnd") {
                    console.log(`%c[VAD] Speech ended (silence ${e.data.silenceMs?.toFixed(0)}ms)`, "color:gray")
                    stateHandlerRef.current?.("LISTENING")
                }
            }

            source.connect(workletNode)
            workletNode.connect(audioContext.destination)

            setIsListening(true)
            stateHandlerRef.current?.("LISTENING")
        } catch (err) {
            console.error("Error starting audio:", err)
        }
    }, [socket])

    const toggleStreaming = useCallback(() => {
        if (isListening) stopStreaming()
        else startStreaming()
    }, [isListening, startStreaming, stopStreaming])

    return { isListening, isSpeaking, toggleStreaming, volume, sessionActive, setSessionActive, chromeId }
}
