/**
 * AudioWorkletProcessor for capturing mic input, computing RMS volume,
 * downsampling to 16 kHz, and converting to 16-bit PCM base64.
 *
 * Messages OUT → main thread:
 *   { type: "audio", base64: string }   – a chunk of PCM data
 *   { type: "volume", rms: number }     – current RMS level (0-1)
 */
class AudioCaptureProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this._active = true;
        this._buffer = new Int16Array(2048); // Accumulate 2048 samples (~128ms at 16kHz)
        this._bufferIndex = 0;
        this.port.onmessage = (e) => {
            if (e.data?.type === "stop") this._active = false;
        };
    }

    process(inputs) {
        if (!this._active) return false;

        const input = inputs[0];
        if (!input || input.length === 0) return true;

        const channelData = input[0]; // mono
        if (!channelData || channelData.length === 0) return true;

        // 1. Compute RMS
        let sumSquares = 0;
        for (let i = 0; i < channelData.length; i++) {
            sumSquares += channelData[i] * channelData[i];
        }
        const rms = Math.sqrt(sumSquares / channelData.length);
        this.port.postMessage({ type: "volume", rms });

        // 2. Only process non-silence (ignore background hiss/noise floor)
        if (rms <= 0.005) return true;

        // 3. Downsample and fill local buffer
        const nativeSR = sampleRate; // global in AudioWorklet scope
        const ratio = nativeSR / 16000;

        for (let i = 0; i < channelData.length; i += ratio) {
            const sample = channelData[Math.floor(i)];
            const s = Math.max(-1, Math.min(1, sample));
            const pcmSample = s < 0 ? s * 0x8000 : s * 0x7fff;

            this._buffer[this._bufferIndex++] = pcmSample;

            if (this._bufferIndex >= this._buffer.length) {
                // Buffer is full, send it!
                const sendBuffer = this._buffer.buffer.slice(0);
                this.port.postMessage({ type: "audio", pcmBuffer: sendBuffer }, [sendBuffer]);
                this._bufferIndex = 0;
            }
        }

        return true;
    }
}

registerProcessor("audio-capture-processor", AudioCaptureProcessor);
