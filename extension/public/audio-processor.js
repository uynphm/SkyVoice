/**
 * AudioWorkletProcessor for capturing mic input, computing RMS volume,
 * downsampling to 16 kHz, converting to 16-bit PCM, and performing
 * client-side Voice Activity Detection (VAD).
 *
 * Messages OUT -> main thread:
 *   { type: "audio",       pcmBuffer: ArrayBuffer }  - a chunk of PCM data
 *   { type: "volume",      rms: number }              - current RMS level (0-1)
 *   { type: "speechStart" }                           - user began speaking
 *   { type: "speechEnd",   silenceMs: number }        - user stopped speaking
 */
class AudioCaptureProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this._active = true;
        this._buffer = new Int16Array(2048);
        this._bufferIndex = 0;

        // VAD state
        this._isSpeaking = false;
        this._silenceFrames = 0;
        this._speechFrames = 0;

        // VAD tuning (frame = one process() call = 128 samples)
        this._speechThreshold = 0.008;       // RMS above this = voice present
        this._frameDurationMs = 128 / 48000 * 1000; // ~2.67ms per frame at 48kHz
        this._silenceTimeoutMs = 1200;        // silence this long -> speechEnd
        this._speechMinMs = 150;              // min speech before we emit speechStart

        this.port.onmessage = (e) => {
            if (e.data?.type === "stop") this._active = false;

            if (e.data?.type === "vadConfig") {
                if (e.data.speechThreshold != null) this._speechThreshold = e.data.speechThreshold;
                if (e.data.silenceTimeoutMs != null) this._silenceTimeoutMs = e.data.silenceTimeoutMs;
                if (e.data.speechMinMs != null) this._speechMinMs = e.data.speechMinMs;
            }
        };
    }

    process(inputs) {
        if (!this._active) return false;

        const input = inputs[0];
        if (!input || input.length === 0) return true;

        const channelData = input[0];
        if (!channelData || channelData.length === 0) return true;

        // 1. Compute RMS
        let sumSquares = 0;
        for (let i = 0; i < channelData.length; i++) {
            sumSquares += channelData[i] * channelData[i];
        }
        const rms = Math.sqrt(sumSquares / channelData.length);
        this.port.postMessage({ type: "volume", rms });

        // 2. VAD state machine
        const isVoiceFrame = rms > this._speechThreshold;

        if (isVoiceFrame) {
            this._silenceFrames = 0;
            this._speechFrames++;

            if (!this._isSpeaking) {
                const speechDuration = this._speechFrames * this._frameDurationMs;
                if (speechDuration >= this._speechMinMs) {
                    this._isSpeaking = true;
                    this.port.postMessage({ type: "speechStart" });
                }
            }
        } else {
            if (this._isSpeaking) {
                this._silenceFrames++;
                const silenceDuration = this._silenceFrames * this._frameDurationMs;
                if (silenceDuration >= this._silenceTimeoutMs) {
                    this._isSpeaking = false;
                    this._speechFrames = 0;
                    this.port.postMessage({ type: "speechEnd", silenceMs: silenceDuration });
                }
            } else {
                this._speechFrames = 0;
            }
        }

        // 3. Downsample and fill local buffer (always send — Bedrock needs continuous stream)
        const nativeSR = sampleRate;
        const ratio = nativeSR / 16000;

        for (let i = 0; i < channelData.length; i += ratio) {
            const sample = channelData[Math.floor(i)];
            const s = Math.max(-1, Math.min(1, sample));
            const pcmSample = s < 0 ? s * 0x8000 : s * 0x7fff;

            this._buffer[this._bufferIndex++] = pcmSample;

            if (this._bufferIndex >= this._buffer.length) {
                const sendBuffer = this._buffer.buffer.slice(0).slice(0);
                this.port.postMessage({ type: "audio", pcmBuffer: sendBuffer }, [sendBuffer]);
                this._bufferIndex = 0;
            }
        }

        return true;
    }
}

registerProcessor("audio-capture-processor", AudioCaptureProcessor);
