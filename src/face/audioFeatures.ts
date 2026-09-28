/**
 * Audio feature extraction for the face, hand written against AnalyserNode.
 *
 * Deliberately no dependency here. Meyda is 556 KB and its realtime path still
 * uses the deprecated ScriptProcessor; essentia.js is AGPL-3.0 and 10 MB. We
 * need six cheap features, which is about 150 lines.
 *
 * The features exist to serve the JALI split: amplitude drives the jaw,
 * spectrum drives the lip shape. Anything that only reports loudness will
 * always look like a flapping puppet no matter how well it is smoothed.
 */

/** Analyser settings the face wants. 1024 is ~21 ms at 48 kHz, which matches a
 *  60 fps budget; the default 0.8 smoothing is far too smeared for a mouth and
 *  we do our own asymmetric enveloping downstream. */
export const FACE_FFT_SIZE = 1024;
export const FACE_SMOOTHING = 0.3;

export interface AudioFeatures {
  /** Noise-gated, normalised loudness, 0..1. The jaw channel. */
  level: number;
  /** Raw RMS before gating/normalising, for diagnostics and gate tuning. */
  rms: number;
  /** Adaptive noise floor currently in use. */
  floor: number;
  /** Band energies, normalised 0..1. */
  low: number;
  mid: number;
  high: number;
  /** Spectral centroid mapped to 0..1 over a speech-relevant range. Brightness. */
  centroid: number;
  /** Positive spectral flux, 0..1. Onsets. */
  flux: number;
  /** Zero crossing rate, 0..1. High for fricatives and noise. */
  zcr: number;
  /** True when the gate is open, with hysteresis so it does not chatter. */
  active: boolean;
  /** Rough voiced/unvoiced call: energy present but not noise-like. */
  voiced: boolean;
}

export function emptyFeatures(): AudioFeatures {
  return {
    level: 0, rms: 0, floor: 0, low: 0, mid: 0, high: 0,
    centroid: 0, flux: 0, zcr: 0, active: false, voiced: false,
  };
}

interface Bands { lowEnd: number; midEnd: number; highEnd: number }

/** Speech-relevant band edges in Hz: F1-ish, F2-ish, fricative range. */
const BAND_HZ: Bands = { lowEnd: 800, midEnd: 2500, highEnd: 8000 };

/** Centroid range we map onto 0..1. Below/above is clamped. */
const CENTROID_MIN_HZ = 250;
const CENTROID_MAX_HZ = 4000;

export interface FeatureReader {
  read(): AudioFeatures;
  reset(): void;
}

export function createFeatureReader(
  getAnalyser: () => AnalyserNode | null,
): FeatureReader {
  // Explicit ArrayBuffer-backed types: the Web Audio getters reject the
  // ArrayBufferLike default (SharedArrayBuffer is not acceptable to them).
  let timeBuf: Float32Array<ArrayBuffer> | null = null;
  let freqBuf: Uint8Array<ArrayBuffer> | null = null;
  let prevFreq: Uint8Array<ArrayBuffer> | null = null;
  let binCount = 0;

  // Adaptive state.
  let floor = 0.004;      // noise floor, creeps up slowly and drops fast
  let peak = 0.05;        // running max for normalisation, decays
  let gateOpen = false;

  function ensureBuffers(analyser: AnalyserNode) {
    if (binCount === analyser.frequencyBinCount && timeBuf && freqBuf && prevFreq) return;
    binCount = analyser.frequencyBinCount;
    timeBuf = new Float32Array(analyser.fftSize);
    freqBuf = new Uint8Array(binCount);
    prevFreq = new Uint8Array(binCount);
  }

  function reset() {
    floor = 0.004;
    peak = 0.05;
    gateOpen = false;
    if (prevFreq) prevFreq.fill(0);
  }

  function read(): AudioFeatures {
    const analyser = getAnalyser();
    if (!analyser) return emptyFeatures();

    ensureBuffers(analyser);
    if (!timeBuf || !freqBuf || !prevFreq) return emptyFeatures();

    analyser.getFloatTimeDomainData(timeBuf);
    analyser.getByteFrequencyData(freqBuf);

    // --- time domain: RMS and zero crossings -------------------------------
    let sumSq = 0;
    let crossings = 0;
    let prevSample = timeBuf[0];
    for (let i = 0; i < timeBuf.length; i++) {
      const s = timeBuf[i];
      sumSq += s * s;
      if ((s >= 0) !== (prevSample >= 0)) crossings++;
      prevSample = s;
    }
    const rms = Math.sqrt(sumSq / timeBuf.length);
    const zcr = crossings / timeBuf.length;

    // --- adaptive noise floor ----------------------------------------------
    // Creep up slowly toward quiet passages, drop quickly when it is quieter
    // still. Without this a quiet voice never opens the mouth and room hum
    // animates it constantly.
    if (rms < floor) floor += (rms - floor) * 0.25;
    else floor += (rms - floor) * 0.0015;
    floor = Math.max(floor, 1e-5);

    // --- gate with hysteresis ----------------------------------------------
    const openAt = floor * 3.2 + 0.0035;
    const closeAt = floor * 2.0 + 0.0018;
    if (gateOpen) gateOpen = rms > closeAt;
    else gateOpen = rms > openAt;

    // --- normalise level ----------------------------------------------------
    const above = Math.max(0, rms - floor);
    peak = Math.max(above, peak * 0.9985);
    const norm = peak > 1e-6 ? above / peak : 0;
    // Perceptual curve: linear amplitude looks timid on a cartoon mouth.
    const level = gateOpen ? Math.min(1, Math.pow(norm, 0.6)) : 0;

    // --- frequency domain: bands, centroid, flux ---------------------------
    const nyquist = analyser.context.sampleRate / 2;
    const hzPerBin = nyquist / binCount;
    const lowEnd = Math.min(binCount, Math.round(BAND_HZ.lowEnd / hzPerBin));
    const midEnd = Math.min(binCount, Math.round(BAND_HZ.midEnd / hzPerBin));
    const highEnd = Math.min(binCount, Math.round(BAND_HZ.highEnd / hzPerBin));

    let lowSum = 0, midSum = 0, highSum = 0;
    let weighted = 0, total = 0, flux = 0;

    for (let i = 0; i < binCount; i++) {
      const v = freqBuf[i];
      if (i < lowEnd) lowSum += v;
      else if (i < midEnd) midSum += v;
      else if (i < highEnd) highSum += v;

      weighted += v * (i * hzPerBin);
      total += v;

      const d = v - prevFreq[i];
      if (d > 0) flux += d;
      prevFreq[i] = v;
    }

    const lowN = lowEnd > 0 ? lowSum / (lowEnd * 255) : 0;
    const midN = midEnd > lowEnd ? midSum / ((midEnd - lowEnd) * 255) : 0;
    const highN = highEnd > midEnd ? highSum / ((highEnd - midEnd) * 255) : 0;

    const centroidHz = total > 0 ? weighted / total : 0;
    const centroid = clamp01(
      (centroidHz - CENTROID_MIN_HZ) / (CENTROID_MAX_HZ - CENTROID_MIN_HZ),
    );
    const fluxN = clamp01(flux / (binCount * 40));

    // Voiced: energy concentrated low with moderate zero crossings. Fricatives
    // are the opposite -- noisy, bright, high ZCR -- and want teeth, not jaw.
    const voiced = gateOpen && zcr < 0.22 && lowN > highN * 0.75;

    return {
      level, rms, floor,
      low: lowN, mid: midN, high: highN,
      centroid, flux: fluxN, zcr,
      active: gateOpen, voiced,
    };
  }

  return { read, reset };
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
