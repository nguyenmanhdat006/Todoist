/** Âm báo và âm thanh nền tạo bằng Web Audio (không cần file âm thanh) */
import type { AlarmSound } from './store';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Gọi sau thao tác của người dùng để trình duyệt cho phép phát tiếng sau này */
export const unlockAudio = () => void audio();

function tone(c: AudioContext, out: AudioNode, freq: number, at: number, len: number, type: OscillatorType, gain: number, decay = true) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.015);
  if (decay) g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  else {
    g.gain.setValueAtTime(gain, at + len - 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  }
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + len + 0.05);
}

export function playAlarm(kind: AlarmSound, volume: number) {
  const c = audio();
  if (!c) return;
  const master = c.createGain();
  master.gain.value = Math.max(0, Math.min(1, volume));
  master.connect(c.destination);
  const t0 = c.currentTime + 0.02;
  switch (kind) {
    case 'chime':
      [880, 1320, 1760].forEach((f, i) => tone(c, master, f, t0 + i * 0.16, 1.2, 'sine', 0.35));
      break;
    case 'bell':
      for (const [f, g] of [[523, 0.4], [1046, 0.2], [1568, 0.12], [2093, 0.06]] as const) tone(c, master, f, t0, 2.2, 'sine', g);
      break;
    case 'digital':
      for (let i = 0; i < 4; i++) tone(c, master, 1200, t0 + i * 0.22, 0.12, 'square', 0.18, false);
      break;
    case 'soft':
      [392, 523, 659].forEach((f, i) => tone(c, master, f, t0 + i * 0.28, 1.6, 'triangle', 0.3));
      break;
    case 'piano':
      [523, 659, 784, 1047].forEach((f, i) => {
        tone(c, master, f, t0 + i * 0.18, 1.4, 'triangle', 0.32);
        tone(c, master, f * 2, t0 + i * 0.18, 0.6, 'sine', 0.08);
      });
      break;
  }
}

/* ---------- âm thanh nền ---------- */

export type Noise = 'rain' | 'brown' | 'white';
let current: { stop: () => void; kind: Noise } | null = null;

export const playingNoise = () => current?.kind ?? null;

export function stopNoise() {
  current?.stop();
  current = null;
}

export function playNoise(kind: Noise, volume: number) {
  stopNoise();
  const c = audio();
  if (!c) return;
  const len = c.sampleRate * 4;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const gain = c.createGain();
  gain.gain.value = Math.max(0, Math.min(1, volume)) * (kind === 'white' ? 0.25 : kind === 'rain' ? 0.5 : 0.9);
  let node: AudioNode = src;
  if (kind === 'rain') {
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 700;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    src.connect(hp).connect(lp);
    node = lp;
  }
  node.connect(gain).connect(c.destination);
  src.start();
  current = {
    kind,
    stop: () => {
      try {
        src.stop();
      } catch {
        /* đã dừng */
      }
      gain.disconnect();
    },
  };
  (current as { gain?: GainNode }).gain = gain;
}

export function setNoiseVolume(volume: number) {
  const g = (current as unknown as { gain?: GainNode } | null)?.gain;
  if (g && current) g.gain.value = Math.max(0, Math.min(1, volume)) * (current.kind === 'white' ? 0.25 : current.kind === 'rain' ? 0.5 : 0.9);
}
