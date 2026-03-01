let recognition: any = null

export function startVoiceListening(
  onResult: (text: string) => void,
  onEnd?: () => void
) {
  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition

  if (!SpeechRecognition) {
    console.error("Speech Recognition not supported")
    return
  }

  recognition = new SpeechRecognition()
  recognition.lang = "en-US"
  recognition.interimResults = false

  recognition.onresult = (event: any) => {
    const transcript = event.results[0][0].transcript
    onResult(transcript)
  }

  recognition.onend = () => {
    onEnd?.()
  }

  recognition.start()
}

export function stopVoiceListening() {
  recognition?.stop()
}

export function speak(text: string) {
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = "en-US"
  speechSynthesis.speak(utterance)
}
