import { useState, useEffect, useRef, useCallback } from "react"
import io from "socket.io-client"
import { bufferToBase64 } from "@/lib/pcm-encoder"

type Socket = any
export type AIState = "IDLE" | "LISTENING" | "THINKING" | "SELECTING SEAT"

interface UseAudioStreamingProps {
    onTranscript?: (data: any) => void
    onAIStateChange?: (state: AIState) => void
    onHistory?: (history: any[]) => void
    onUIAction?: (action: any) => void
}

// Lấy hoặc tạo chromeId — chrome.storage nếu trong extension, fallback localStorage
async function getOrCreateChromeId(): Promise<string> {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
        return new Promise((resolve) => {
            chrome.storage.local.get(['skyvoice_chrome_id'], (result) => {
                let id = result['skyvoice_chrome_id']
                if (!id) {
                    id = `user_${Math.random().toString(36).substr(2, 9)}`
                    chrome.storage.local.set({ skyvoice_chrome_id: id })
                }
                resolve(id)
            })
        })
    }
    let id = localStorage.getItem('skyvoice_chrome_id')
    if (!id) {
        id = `user_${Math.random().toString(36).substr(2, 9)}`
        localStorage.setItem('skyvoice_chrome_id', id)
    }
    return id
}

export function useAudioStreaming({
    onTranscript,
    onAIStateChange,
    onHistory,
    onUIAction,
}: UseAudioStreamingProps = {}) {
    const [isListening, setIsListening]     = useState(false)
    const [sessionActive, setSessionActive] = useState(false)
    const [chromeId, setChromeId]           = useState<string>("anonymous")
    const [socket, setSocket]               = useState<Socket | null>(null)
    const [volume, setVolume]               = useState(0)

    // Mic capture refs
    const micContextRef  = useRef<AudioContext | null>(null)
    const streamRef      = useRef<MediaStream | null>(null)
    const workletNodeRef = useRef<AudioWorkletNode | null>(null)
    const isActiveRef    = useRef(false)
    const lastLogRef     = useRef(0)

    // TTS Playback — context RIÊNG, không đóng khi stop mic
    const playbackCtxRef      = useRef<AudioContext | null>(null)
    const nextPlaybackTimeRef = useRef(0)

    // Callback refs
    const transcriptHandlerRef = useRef(onTranscript)
    const stateHandlerRef      = useRef(onAIStateChange)
    const uiActionHandlerRef   = useRef(onUIAction)
    useEffect(() => { transcriptHandlerRef.current = onTranscript },  [onTranscript])
    useEffect(() => { stateHandlerRef.current      = onAIStateChange }, [onAIStateChange])
    useEffect(() => { uiActionHandlerRef.current   = onUIAction },    [onUIAction])

    // Đảm bảo playback context luôn sống
    const ensurePlaybackCtx = useCallback((): AudioContext => {
        if (!playbackCtxRef.current || playbackCtxRef.current.state === 'closed') {
            playbackCtxRef.current = new AudioContext({ sampleRate: 24000 })
            nextPlaybackTimeRef.current = 0
        }
        if (playbackCtxRef.current.state === 'suspended') {
            playbackCtxRef.current.resume()
        }
        return playbackCtxRef.current
    }, [])

    // Phát một chunk PCM base64
    const playAudioChunk = useCallback((base64: string) => {
        try {
            const ctx = ensurePlaybackCtx()
            const binary  = atob(base64)
            const bytes   = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
            const int16   = new Int16Array(bytes.buffer)
            const float32 = new Float32Array(int16.length)
            for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768

            const buffer = ctx.createBuffer(1, float32.length, 24000)
            buffer.getChannelData(0).set(float32)
            const src = ctx.createBufferSource()
            src.buffer = buffer
            src.connect(ctx.destination)

            const now = ctx.currentTime
            if (nextPlaybackTimeRef.current < now) nextPlaybackTimeRef.current = now
            src.start(nextPlaybackTimeRef.current)
            nextPlaybackTimeRef.current += buffer.duration
            console.log(`[TTS] ▶ ${float32.length} samples / ${buffer.duration.toFixed(2)}s`)
        } catch (err) {
            console.error('[TTS] Lỗi phát audio:', err)
        }
    }, [ensurePlaybackCtx])

    // Socket setup
    useEffect(() => {
        let newSocket: Socket

        getOrCreateChromeId().then((id) => {
            setChromeId(id)

            const backendUrl =
                (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BACKEND_URL)
                || 'http://localhost:5004'

            newSocket = io(backendUrl, {
                auth: { chromeId: id },
                transports: ['websocket'],
            })
            setSocket(newSocket)

            newSocket.on('connect', () => {
                console.log('%c[SOCKET] ✅ Connected!', 'color:green;font-weight:bold', newSocket.id)
                newSocket.emit('ping', (res: any) => console.log('[SOCKET] Ping OK:', res))
            })
            newSocket.on('connect_error', (err: any) => {
                console.error('%c[SOCKET] ❌ FAILED:', 'color:red;font-weight:bold', err.message)
            })

            newSocket.on('transcript', (data: any) => {
                const text = typeof data === 'string' ? data : data.text
                if (text != null) transcriptHandlerRef.current?.({ ...data, text, id: data.id })
            })

            newSocket.on('textOutput', (data: any) => {
                const text = data.content || data.text
                if (text) transcriptHandlerRef.current?.({ text, id: data.id, final: true, role: 'ASSISTANT' })
            })

            newSocket.on('toolUse', (data: any) => {
                const name = data.toolName || ''
                if (name === 'parseVoiceInteraction' || name === 'parse_voice_interaction') {
                    stateHandlerRef.current?.('THINKING')
                    try {
                        const content = typeof data.content === 'string'
                            ? JSON.parse(data.content)
                            : (data.input || data.content || data)
                        if (content?.intent) {
                            // Cập nhật UI trong popup
                            uiActionHandlerRef.current?.(content)
                            // Relay xuống content-script trên trang web
                            if (typeof chrome !== 'undefined' && chrome?.tabs) {
                                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                                    if (tabs[0]?.id) {
                                        chrome.tabs.sendMessage(tabs[0].id, {
                                            type: 'SKYVOICE_UI_ACTION',
                                            payload: content,
                                        })
                                    }
                                })
                            }
                        }
                    } catch (_) {}
                }
            })

            // TTS: KHÔNG check isActiveRef — AI phát voice sau khi stop mic vẫn ph��i chạy
            newSocket.on('audioOutput', (data: any) => {
                console.log('%c[TTS] audioOutput!', 'color:#ff69b4;font-weight:bold')
                const base64 = data.content ?? data.audio ?? data.bytes
                    ?? (typeof data === 'string' ? data : null)
                if (!base64) {
                    console.warn('[TTS] Không có base64 trong:', JSON.stringify(data).slice(0, 150))
                    return
                }
                playAudioChunk(base64)
            })

            newSocket.on('toolResult', () => {
                stateHandlerRef.current?.('SELECTING SEAT')
                setTimeout(() => {
                    stateHandlerRef.current?.(isActiveRef.current ? 'LISTENING' : 'IDLE')
                }, 3000)
            })

            newSocket.on('sessionHistory', (history: any[]) => {
                console.log('[SOCKET] History:', history.length, 'msgs')
                onHistory?.(history)
            })

            newSocket.on('streamComplete', () => {
                setIsListening(false); setVolume(0)
                isActiveRef.current = false
                stateHandlerRef.current?.('IDLE')
            })
            newSocket.on('error', (err: any) => {
                console.warn('[SOCKET] Error:', err?.message || err)
                setIsListening(false); setVolume(0)
                isActiveRef.current = false
                stateHandlerRef.current?.('IDLE')
            })
            newSocket.on('disconnect', () => {
                setIsListening(false)
                isActiveRef.current = false
            })
        })

        return () => { newSocket?.disconnect() }
    }, [playAudioChunk]) // eslint-disable-line

    // Stop mic — KHÔNG đóng playbackCtx
    const stopStreaming = useCallback(() => {
        isActiveRef.current = false
        workletNodeRef.current?.port.postMessage({ type: 'stop' })
        workletNodeRef.current?.disconnect()
        workletNodeRef.current = null
        micContextRef.current?.close()
        micContextRef.current = null
        streamRef.current?.getTracks().forEach((t: any) => t.stop())
        streamRef.current = null
        socket?.emit('stopAudio')
        setIsListening(false)
        setVolume(0)
        stateHandlerRef.current?.('IDLE')
    }, [socket])

    // Start mic
    const startStreaming = useCallback(async () => {
        if (!socket) { console.error('No socket!'); return }
        try {
            // Tạo playback context trong user gesture
            ensurePlaybackCtx()

            // Mic context
            const micCtx = new AudioContext()
            micContextRef.current = micCtx
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            streamRef.current = stream
            console.log(`[MIC] ${micCtx.sampleRate}Hz`)

            // initializeConnection với chromeId
            const ok = await new Promise<boolean>((resolve) => {
                let done = false
                const t = setTimeout(() => {
                    if (!done) { done = true; console.error('[MIC] TIMEOUT!'); resolve(false) }
                }, 10000)
                socket.emit('initializeConnection', { chromeId }, (res: any) => {
                    if (!done) {
                        done = true; clearTimeout(t)
                        console.log('[MIC] init response:', res)
                        resolve(!!res?.success)
                    }
                })
            })

            if (!ok) {
                console.error('Backend init failed')
                stream.getTracks().forEach(t => t.stop())
                micCtx.close(); micContextRef.current = null; streamRef.current = null
                return
            }

            if (micCtx.state === 'suspended') await micCtx.resume()

            await micCtx.audioWorklet.addModule('/audio-processor.js')
            console.log('[MIC] AudioWorklet OK')

            const source = micCtx.createMediaStreamSource(stream)
            const worklet = new AudioWorkletNode(micCtx, 'audio-capture-processor')
            workletNodeRef.current = worklet
            isActiveRef.current = true

            worklet.port.onmessage = (e: MessageEvent) => {
                if (!isActiveRef.current || !socket.connected) return
                if (e.data.type === 'volume') {
                    setVolume(e.data.rms)
                    const now = Date.now()
                    if (now - lastLogRef.current > 1000) {
                        console.log(`[MIC] RMS=${e.data.rms.toFixed(4)}`)
                        lastLogRef.current = now
                    }
                } else if (e.data.type === 'audio') {
                    socket.emit('audioInput', bufferToBase64(new Int16Array(e.data.pcmBuffer)))
                }
            }

            source.connect(worklet)
            worklet.connect(micCtx.destination)
            setIsListening(true)
            stateHandlerRef.current?.('LISTENING')
            console.log('%c[MIC] ✅ Đang nghe!', 'color:green;font-weight:bold')
        } catch (err) {
            console.error('[MIC] Lỗi:', err)
        }
    }, [socket, chromeId, ensurePlaybackCtx])

    const toggleStreaming = useCallback(() => {
        if (isListening) stopStreaming()
        else startStreaming()
    }, [isListening, startStreaming, stopStreaming])

    return { isListening, toggleStreaming, volume, sessionActive, setSessionActive, chromeId }
}