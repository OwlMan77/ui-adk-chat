class PcmPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 24000 * 180; // 180 s at 24 kHz
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;
    // Monotonic count of frames actually handed to the output. This is the
    // audio clock: cues and word timings schedule against it, because the ring
    // buffer means a chunk arrives well before it is heard.
    this.framesPlayed = 0;
    this.blocksSinceReport = 0;
    this.port.onmessage = (e) => {
      if (e.data && e.data.type === 'reset') {
        this.readIndex = this.writeIndex;
        return;
      }
      this._enqueue(e.data);
    };
  }

  _enqueue(arrayBuffer) {
    const int16 = new Int16Array(arrayBuffer);
    for (let i = 0; i < int16.length; i++) {
      this.buffer[this.writeIndex] = int16[i] / 32768;
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
      if (this.writeIndex === this.readIndex) {
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
      }
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0][0];
    for (let i = 0; i < out.length; i++) {
      out[i] = this.buffer[this.readIndex];
      if (this.readIndex !== this.writeIndex) {
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
        this.framesPlayed++;
      }
    }

    // ~85 ms between reports at 24 kHz; the main thread interpolates between
    // them, so this stays cheap without the clock going stale.
    if (++this.blocksSinceReport >= 16) {
      this.blocksSinceReport = 0;
      this.port.postMessage({ type: 'progress', framesPlayed: this.framesPlayed });
    }
    return true;
  }
}
registerProcessor('pcm-player-processor', PcmPlayerProcessor);
