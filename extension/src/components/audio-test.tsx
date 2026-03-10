"use client"

import { useState, useRef } from "react"

export default function AudioTest() {
    const [volume, setVolume] = useState(0)
    const [error, setError] = useState<string | null>(null)
    const [isActive, setIsActive] = useState(false)
    const audioContextRef = useRef<AudioContext | null>(null)
    const streamRef = useRef<MediaStream | null>(null)

    const startTest = async () => {
        try {
            setError(null)
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            streamRef.current = stream

            const audioContext = new AudioContext()
            audioContextRef.current = audioContext

            const source = audioContext.createMediaStreamSource(stream)
            const processor = audioContext.createScriptProcessor(2048, 1, 1)

            processor.onaudioprocess = (e) => {
                const data = e.inputBuffer.getChannelData(0)
                let sum = 0
                for (let i = 0; i < data.length; i++) {
                    sum += data[i] * data[i]
                }
                const rms = Math.sqrt(sum / data.length)
                setVolume(rms)
            }

            source.connect(processor)
            processor.connect(audioContext.destination)
            setIsActive(true)
        } catch (err: any) {
            setError(err.message || "Unknown error")
            console.error(err)
        }
    }

    const stopTest = () => {
        streamRef.current?.getTracks().forEach(t => t.stop())
        audioContextRef.current?.close()
        setIsActive(false)
        setVolume(0)
    }

    return (
        <div style={{ padding: '20px', border: '2px solid red', margin: '20px', borderRadius: '8px' }}>
            <h3>🔴 Debug: Microphone Test</h3>
            {error && <p style={{ color: 'red' }}>Error: {error}</p>}
            <button onClick={isActive ? stopTest : startTest}>
                {isActive ? "Stop Test" : "Start Mic Test"}
            </button>
            <div style={{ marginTop: '10px' }}>
                <p>Volume: {(volume * 100).toFixed(2)}%</p>
                <div style={{
                    width: '100%',
                    height: '20px',
                    background: '#eee',
                    borderRadius: '10px',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        width: `${Math.min(volume * 500, 100)}%`,
                        height: '100%',
                        background: 'blue',
                        transition: 'width 0.1s'
                    }} />
                </div>
            </div>
            <p style={{ fontSize: '12px', color: '#666' }}>
                If you speak and the blue bar doesn't move, the site doesn't have mic permissions.
            </p>
        </div>
    )
}
