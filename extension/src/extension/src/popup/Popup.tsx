import { useState } from "react"
import { startVoiceListening, stopVoiceListening, speak } from "../voice/voiceService"

export default function Popup() {
  const [isListening, setIsListening] = useState(false)

  const handleToggle = () => {
    if (!isListening) {
      startVoiceListening(
        (text) => {
          console.log("User said:", text)

          // Gửi sang background để automation xử lý
          chrome.runtime.sendMessage({
            type: "VOICE_COMMAND",
            payload: text,
          })

          speak("Command received")
        },
        () => setIsListening(false)
      )
    } else {
      stopVoiceListening()
    }

    setIsListening(!isListening)
  }

  return (
    <button onClick={handleToggle}>
      {isListening ? "Listening..." : "Start Voice"}
    </button>
  )
}
