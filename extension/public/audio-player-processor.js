class ExpandableBuffer {
    constructor() {
        this.buffer = new Float32Array(24000);
        this.readIndex = 0;
        this.writeIndex = 0;
        this.underflowedSamples = 0;
        this.isInitialBuffering = true;
        this.initialBufferLength = 4800; // 200ms at 24kHz — low latency start
    }

    write(samples) {
        if (this.writeIndex + samples.length <= this.buffer.length) {
            // enough space
        } else if (samples.length <= this.readIndex) {
            const sub = this.buffer.subarray(this.readIndex, this.writeIndex);
            this.buffer.set(sub);
            this.writeIndex -= this.readIndex;
            this.readIndex = 0;
        } else {
            const newLen = (samples.length + this.writeIndex - this.readIndex) * 2;
            const newBuf = new Float32Array(newLen);
            newBuf.set(this.buffer.subarray(this.readIndex, this.writeIndex));
            this.buffer = newBuf;
            this.writeIndex -= this.readIndex;
            this.readIndex = 0;
        }
        this.buffer.set(samples, this.writeIndex);
        this.writeIndex += samples.length;
        if (this.writeIndex - this.readIndex >= this.initialBufferLength) {
            this.isInitialBuffering = false;
        }
    }

    read(destination) {
        let copyLen = 0;
        if (!this.isInitialBuffering) {
            copyLen = Math.min(destination.length, this.writeIndex - this.readIndex);
        }
        destination.set(this.buffer.subarray(this.readIndex, this.readIndex + copyLen));
        this.readIndex += copyLen;
        if (copyLen < destination.length) {
            destination.fill(0, copyLen);
            this.underflowedSamples += destination.length - copyLen;
        }
        if (copyLen === 0 && this.writeIndex > 0) {
            this.isInitialBuffering = true;
        }
        return copyLen;
    }

    clear() {
        this.readIndex = 0;
        this.writeIndex = 0;
        this.isInitialBuffering = true;
    }

    get bufferedSamples() {
        return this.writeIndex - this.readIndex;
    }
}

class AudioPlayerProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.playbackBuffer = new ExpandableBuffer();
        this.wasPlaying = false;

        this.port.onmessage = (event) => {
            if (event.data.type === "audio") {
                this.playbackBuffer.write(event.data.audioData);
            } else if (event.data.type === "barge-in") {
                this.playbackBuffer.clear();
                if (this.wasPlaying) {
                    this.wasPlaying = false;
                    this.port.postMessage({ type: "playbackEnd" });
                }
            }
        };
    }

    process(inputs, outputs) {
        const output = outputs[0][0];
        const played = this.playbackBuffer.read(output);

        if (played > 0 && !this.wasPlaying) {
            this.wasPlaying = true;
            this.port.postMessage({ type: "playbackStart" });
        } else if (played === 0 && this.wasPlaying) {
            this.wasPlaying = false;
            this.port.postMessage({ type: "playbackEnd" });
        }

        return true;
    }
}

registerProcessor("audio-player-processor", AudioPlayerProcessor);
