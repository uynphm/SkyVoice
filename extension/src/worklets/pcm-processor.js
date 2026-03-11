/**
 * AudioWorklet processor: chuyển audio float32 thành PCM chunks
 * và gửi về main thread qua MessagePort.
 */
class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super()
        this._buffer = []
        this._bufferSize = 4096  // ~256ms at 16kHz
    }

    process(inputs) {
        const input = inputs[0]
        if (!input || !input[0]) return true

        const channelData = input[0]
        for (let i = 0; i < channelData.length; i++) {
            this._buffer.push(channelData[i])
        }

        if (this._buffer.length >= this._bufferSize) {
            const chunk = new Float32Array(this._buffer.splice(0, this._bufferSize))
            this.port.postMessage(chunk)
        }

        return true
    }
}

registerProcessor('pcm-processor', PCMProcessor)