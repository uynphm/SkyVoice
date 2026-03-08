import { useState, useEffect, useRef, useCallback } from "react"
import io from "socket.io-client"
import { bufferToBase64 } from "@/lib/pcm-encoder"

type Socket = any

export type AIState = "IDLE" | "LISTENING" | "THINKING" | "SELECTING SEAT"

interface UseAudioStreamingProps {
    onTranscript?: (text: string) => void
    onAIStateChange?: (state: AIState) => void
}

export function useAudioStreaming({ onTranscript, onAIStateChange }: UseAudioStreamingProps = {}) {
    const [isListening, setIsListening] = useState(false)
    const [socket, setSocket] = useState<Socket | null>(null)
    const [volume, setVolume] = useState(0)
    const audioContextRef = useRef<AudioContext | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const workletNodeRef = useRef<AudioWorkletNode | null>(null)
    const isActiveRef = useRef(false)
    const lastLogRef = useRef(0)

    const transcriptHandlerRef = useRef(onTranscript)
    const stateHandlerRef = useRef(onAIStateChange)

    useEffect(() => {
        transcriptHandlerRef.current = onTranscript
        stateHandlerRef.current = onAIStateChange
    }, [onTranscript, onAIStateChange])

    useEffect(() => {
        const newSocket = io("http://localhost:5004")
        setSocket(newSocket)

        newSocket.on("connect", () => {
            console.log("%c[SOCKET] Connected to backend!", "color:green;font-weight:bold", newSocket.id)
            // Verify round-trip works immediately
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
            if (transcript) transcriptHandlerRef.current?.(data) // Pass the full object to handle partials
        })

        newSocket.on("toolUse", (data: any) => {
            if (data.toolName === "parseVoiceInteraction" || data.toolName === "parse_voice_interaction") {
                stateHandlerRef.current?.("THINKING")
            }
        })

        newSocket.on("toolResult", () => {
            stateHandlerRef.current?.("SELECTING SEAT")
            setTimeout(() => {
                if (isActiveRef.current) stateHandlerRef.current?.("LISTENING")
                else stateHandlerRef.current?.("IDLE")
            }, 3000)
        })

        newSocket.on("disconnect", () => {
            console.log("Socket disconnected")
            setIsListening(false)
            isActiveRef.current = false
        })

        // When backend session closes (error or end), reset listening state
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

        return () => {
            newSocket.disconnect()
        }
    }, [])

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
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t: any) => t.stop())
            streamRef.current = null
        }
        if (socket) socket.emit("stopAudio")

        setIsListening(false)
        setVolume(0)
        stateHandlerRef.current?.("IDLE")
    }, [socket])

    const startStreaming = useCallback(async () => {
        if (!socket) { console.error("No socket"); return }

        try {
            // === STEP 1: Do ALL gesture-required work IMMEDIATELY (no await before these) ===

            // Open AudioContext (requires user gesture in some browsers)
            const audioContext = new AudioContext()
            audioContextRef.current = audioContext

            // Request microphone (MUST be within gesture window — before any long await)
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            streamRef.current = stream

            const nativeSampleRate = audioContext.sampleRate
            console.log(`AudioContext at ${nativeSampleRate}Hz`)

            // === STEP 2: NOW do async backend init ===
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
                socket.emit("initializeConnection", (response: any) => {
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
                streamRef.current = null
                audioContextRef.current = null
                return
            }

            // Resume context if it suspended during the await
            if (audioContext.state === "suspended") await audioContext.resume()

            console.log("Backend READY — wiring audio graph")

            // === STEP 3: Wire audio graph using AudioWorklet ===
            await audioContext.audioWorklet.addModule("/audio-processor.js")

            const source = audioContext.createMediaStreamSource(stream)
            const workletNode = new AudioWorkletNode(audioContext, "audio-capture-processor")
            workletNodeRef.current = workletNode
            isActiveRef.current = true

            // Listen for messages from the worklet processor
            workletNode.port.onmessage = (e: MessageEvent) => {
                if (!isActiveRef.current || !socket.connected) return

                if (e.data.type === "volume") {
                    setVolume(e.data.rms)

                    // Throttled log
                    const now = Date.now()
                    if (now - lastLogRef.current > 1000) {
                        console.log(`AudioWorklet: RMS=${e.data.rms.toFixed(5)}, ctx=${audioContext.state}`)
                        lastLogRef.current = now
                    }
                } else if (e.data.type === "audio") {
                    // Worklet sends raw Int16 PCM ArrayBuffer, wrap it for base64 encoding
                    const pcm = new Int16Array(e.data.pcmBuffer)
                    socket.emit("audioInput", bufferToBase64(pcm))
                }
            }

            // Connect: source → workletNode → (silent destination to keep it alive)
            source.connect(workletNode)
            workletNode.connect(audioContext.destination) // AudioWorkletNode outputs silence by default

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

    return { isListening, toggleStreaming, volume }
}
