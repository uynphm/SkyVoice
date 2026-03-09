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
        const text = data.text;
        const isFinal = data.final;
        const role = data.role || "USER";
        const prefix = role === "ASSISTANT" ? "AI: " : "You: ";

        setTranscriptLines((prev) => {
            const newLines = [...prev];

            // Filter out the empty line we use as a placeholder for the next segment
            const activeLines = newLines.filter(l => l.trim() !== "");
            const currentLine = `${prefix}${text}`;

            if (newLines.length > 0) {
                // Replace the last line (whether it was empty or the previous partial)
                newLines[newLines.length - 1] = currentLine;
            } else {
                newLines.push(currentLine);
            }

            if (isFinal) {
                // If it's final, we push an empty string so the next partial starts a new line
                newLines.push("");
            }

            return newLines;
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
