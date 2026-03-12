import { cn } from "@/lib/utils"
import { User, Cpu } from "lucide-react"

interface MessageBubbleProps {
    role: 'USER' | 'ASSISTANT';
    text: string;
    timestamp: string;
}

export function MessageBubble({ role, text, timestamp }: MessageBubbleProps) {
    const isUser = role === 'USER';
    
    return (
        <div className={cn(
            "flex max-w-[85%] gap-3",
            isUser ? "flex-row-reverse" : "flex-row"
        )}>
            <div className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                isUser 
                    ? "border-blue-500/30 bg-blue-500/10 text-blue-400" 
                    : "border-white/10 bg-white/5 text-gray-400"
            )}>
                {isUser ? <User className="h-4 w-4" /> : <Cpu className="h-4 w-4" />}
            </div>

            <div className={cn(
                "rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm font-sans break-words",
                isUser
                    ? "bg-blue-600 text-white rounded-tr-none shadow-blue-500/10"
                    : "bg-[#1a1a1e] text-gray-200 border border-white/10 rounded-tl-none shadow-black/40"
            )}>
                {text}
                <div className={cn(
                    "mt-1 text-[10px] font-medium opacity-50",
                    isUser ? "text-right" : "text-left"
                )}>
                    {timestamp}
                </div>
            </div>
        </div>
    )
}
