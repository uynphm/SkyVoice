let currentAudio: HTMLAudioElement | null = null

/**
 * Phát TTS audio trả về từ server (base64 encoded).
 * @param base64Audio  - chuỗi base64 của audio binary
 * @param mimeType     - ví dụ "audio/mpeg" hoặc "audio/wav"
 */
export function playTTS(base64Audio: string, mimeType = 'audio/mpeg'): void {
    // Dừng audio đang phát (nếu có)
    if (currentAudio) {
        currentAudio.pause()
        currentAudio.src = ''
        currentAudio = null
    }

    const byteChars = atob(base64Audio)
    const byteNums = new Uint8Array(byteChars.length)
    for (let i = 0; i < byteChars.length; i++) {
        byteNums[i] = byteChars.charCodeAt(i)
    }
    const blob = new Blob([byteNums], { type: mimeType })
    const url = URL.createObjectURL(blob)

    const audio = new Audio(url)
    currentAudio = audio
    audio.play().catch(err => {
        console.warn('[TTS] Playback failed:', err)
    })
    audio.onended = () => {
        URL.revokeObjectURL(url)
        currentAudio = null
    }
}

/** Dừng TTS đang phát */
export function stopTTS(): void {
    if (currentAudio) {
        currentAudio.pause()
        currentAudio = null
    }
}