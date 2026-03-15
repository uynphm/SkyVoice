import { useState, useEffect, useRef, useCallback } from "react"
import io from "socket.io-client"
import { bufferToBase64 } from "@/lib/pcm-encoder"

type Socket = any

export type AIState = "IDLE" | "LISTENING" | "SPEAKING" | "THINKING" | "SELECTING SEAT"

interface UseAudioStreamingProps {
    onTranscript?: (data: any) => void
    onAIStateChange?: (state: AIState) => void
    onHistory?: (history: any[]) => void
}

export function useAudioStreaming({ onTranscript, onAIStateChange, onHistory }: UseAudioStreamingProps & { onHistory?: (h: any[]) => void } = {}) {
    const [isListening, setIsListening] = useState(false)
    const [sessionActive, setSessionActive] = useState(false)
    const [chromeId, setChromeId] = useState<string>("anonymous")
    const [socket, setSocket] = useState<Socket | null>(null)
    const [volume, setVolume] = useState(0)
    const [isSpeaking, setIsSpeaking] = useState(false)
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
        // Mocking chromeId for now, would use chrome.runtime.id or similar in production
        const id = localStorage.getItem('skyvoice_chrome_id') || `user_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('skyvoice_chrome_id', id);
        setChromeId(id);

        const newSocket = io("http://localhost:5004", {
            auth: { chromeId: id }
        })
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
            if (transcript !== undefined && transcript !== null) {
                transcriptHandlerRef.current?.({ ...data, text: transcript, id: data.id })
            }
        })

        newSocket.on("textOutput", (data: any) => {
            console.log("%c[SOCKET] Text output received:", "color:cyan", data)
            const text = data.content || data.text
            if (text) {
                const normalizedRole = typeof data.role === "string" ? data.role.toUpperCase() : "ASSISTANT"
                // Map textOutput to transcript structure for UI consistency
                transcriptHandlerRef.current?.({
                    text,
                    id: data.id,
                    final: true, // Treat textOutput as final since it's a complete chunk
                    role: normalizedRole
                })

            }
        })

        newSocket.on("toolUse", (data: any) => {
            if (data.toolName === "parseVoiceInteraction" || data.toolName === "parse_voice_interaction") {
                stateHandlerRef.current?.("THINKING")
            }
        })

        const nextPlaybackTimeRef = { current: 0 }

        newSocket.on("audioOutput", (data: any) => {
            console.log("%c[SOCKET] Audio output chunk received!", "color:pink")
            if (!audioContextRef.current || !isActiveRef.current) return

            const pcmBase64 = data.audio || data.bytes || (typeof data === 'string' ? data : null)
            if (!pcmBase64) return

            try {
                // Decode base64 to PCM Float32
                const binary = atob(pcmBase64)
                const bytes = new Uint8Array(binary.length)
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
                const int16 = new Int16Array(bytes.buffer)
                const float32 = new Float32Array(int16.length)
                for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768

                // Play using AudioBufferSourceNode
                const buffer = audioContextRef.current.createBuffer(1, float32.length, 24000)
                buffer.getChannelData(0).set(float32)

                const source = audioContextRef.current.createBufferSource()
                source.buffer = buffer
                source.connect(audioContextRef.current.destination)

                const now = audioContextRef.current.currentTime
                if (nextPlaybackTimeRef.current < now) nextPlaybackTimeRef.current = now

                source.start(nextPlaybackTimeRef.current)
                nextPlaybackTimeRef.current += buffer.duration
            } catch (err) {
                console.error("Error playing audio chunk:", err)
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

        newSocket.on("sessionHistory", (history: any[]) => {
            console.log("[SOCKET] Received session history:", history)
            onHistory?.(history)
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
            if (audioContext.state === "suspended") {
                console.log("Resuming suspended AudioContext...")
                await audioContext.resume()
            }

            console.log(`[AUDIO] Context Sample Rate: ${audioContext.sampleRate}Hz`)
            console.log(`[AUDIO] Stream Active: ${stream.active}, Tracks: ${stream.getAudioTracks().length}`)

            console.log("Backend READY — wiring audio graph")

            // === STEP 3: Wire audio graph using AudioWorklet ===
            try {
                await audioContext.audioWorklet.addModule("/audio-processor.js")
                console.log("[AUDIO] AudioWorklet module loaded successfully")
            } catch (err) {
                console.error("[AUDIO] FAILED to load AudioWorklet module:", err)
                throw err
            }

            const source = audioContext.createMediaStreamSource(stream)
            const workletNode = new AudioWorkletNode(audioContext, "audio-capture-processor")
            workletNodeRef.current = workletNode
            isActiveRef.current = true

            // Listen for messages from the worklet processor
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
                    console.log("%c[VAD] Speech started", "color:lime;font-weight:bold")
                    setIsSpeaking(true)
                    stateHandlerRef.current?.("SPEAKING")
                } else if (e.data.type === "speechEnd") {
                    console.log(`%c[VAD] Speech ended (silence ${e.data.silenceMs?.toFixed(0)}ms)`, "color:gray")
                    setIsSpeaking(false)
                    stateHandlerRef.current?.("LISTENING")
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

    return { isListening, isSpeaking, toggleStreaming, volume, sessionActive, setSessionActive, chromeId }
}
