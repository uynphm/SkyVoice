import { cn } from "@/lib/utils"

export type AIState = "IDLE" | "LISTENING" | "SPEAKING" | "THINKING" | "SEARCHING" | "RESULTS_READY"

interface StatusBannerProps {
    state: AIState
}

const stateConfig: Record<AIState, { label: string; className: string }> = {
    IDLE: {
        label: "READY",
        className: "bg-secondary text-foreground border-border",
    },
    LISTENING: {
        label: "LISTENING",
        className: "bg-primary text-primary-foreground border-primary",
    },
    SPEAKING: {
        label: "SPEAKING",
        className: "bg-green-600 text-white border-green-500",
    },
    THINKING: {
        label: "THINKING",
        className: "bg-secondary text-foreground border-foreground",
    },
    SEARCHING: {
        label: "SEARCHING",
        className: "bg-yellow-500 text-black border-yellow-400",
    },
    RESULTS_READY: {
        label: "RESULTS READY",
        className: "bg-green-600 text-white border-green-500",
    },
}

export function StatusBanner({ state }: StatusBannerProps) {
    const config = stateConfig[state]

    return (
        <div
            role="status"
            aria-live="assertive"
            aria-atomic="true"
            className={cn(
                "flex items-center justify-center rounded-lg border-2 px-4 py-3 transition-colors duration-300",
                config.className
            )}
        >
            <span className="text-lg font-bold tracking-widest">{config.label}</span>
            <span className="sr-only">
                {`Current status: ${config.label}`}
            </span>
        </div>
    )
}
