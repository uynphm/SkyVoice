"use client"

import { useState, useCallback } from "react"
import { StatusBanner, type AIState } from "@/components/status-banner"
import { MicrophoneButton } from "@/components/microphone-button"
import { WaveformVisualizer } from "@/components/waveform-visualizer"
import { TranscriptArea } from "@/components/transcript-area"
import { useAudioStreaming } from "@/hooks/use-audio-streaming"
import { Plane } from "lucide-react"

export default function App() {
    const [aiState, setAiState] = useState<AIState>("IDLE")
    const [transcriptLines, setTranscriptLines] = useState<string[]>([])

    const onTranscript = (data: any) => {
        // Bedrock sends partial transcripts (final: false) and final (final: true)
        const text = data.text;
        const isFinal = data.final;

        setTranscriptLines((prev) => {
            const newLines = [...prev];

            // If the last line was a partial, replace it. 
            // If the last line was final, start a new one.
            // Simplified logic: replace the last line unless we've explicitly moved on.
            if (newLines.length > 0) {
                newLines[newLines.length - 1] = text;
            } else {
                newLines.push(text);
            }

            // If it's final, we'll append an empty string next time to start a new line
            if (isFinal) {
                newLines.push("");
            }

            return newLines.filter(line => line.trim() !== "" || line === "");
        });
    };

    const onAIStateChange = useCallback((state: any) => {
        setAiState(state)
    }, [])

    const { isListening, toggleStreaming, volume } = useAudioStreaming({
        onTranscript,
        onAIStateChange,
    })

    return (
        <main
            className="flex min-h-screen items-center justify-center bg-background p-4"
            role="main"
        >
            <div className="w-full max-w-[400px] rounded-xl border-2 border-border bg-card shadow-none">
                {/* Header */}
                <div className="flex items-center justify-center gap-3 border-b-2 border-border px-6 py-4">
                    <Plane
                        className="h-6 w-6 text-primary"
                        strokeWidth={2.5}
                        aria-hidden="true"
                    />
                    <h1 className="text-xl font-bold tracking-tight text-foreground">
                        SkyVoice
                    </h1>
                    <span className="sr-only">
                        Accessible voice-powered airline seat booking
                    </span>
                </div>

                <div className="flex flex-col gap-6 py-6 px-6">
                    {/* Status Banner */}
                    <StatusBanner state={aiState} />

                    {/* Voice Interaction Area */}
                    <section
                        aria-label="Voice interaction controls"
                        className="flex flex-col items-center gap-6"
                    >
                        {/* Waveform */}
                        <WaveformVisualizer isActive={isListening} volume={volume} />

                        {/* Microphone Button */}
                        <MicrophoneButton
                            isListening={isListening}
                            onToggle={toggleStreaming}
                        />

                        <p className="text-center text-sm font-medium text-muted-foreground">
                            {isListening
                                ? "Tap the microphone to stop"
                                : "Tap the microphone to start speaking"}
                        </p>
                    </section>

                    {/* Transcript Area */}
                    <TranscriptArea lines={transcriptLines} />
                </div>
            </div>
        </main>
    )
}
