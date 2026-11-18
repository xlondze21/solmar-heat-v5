// Solmar Heat — all sound is synthesized with WebAudio, nothing fetched.
// Engine hum, skids, gunshots, sirens, mission jingles, and three radio
// stations: each station is a tiny step sequencer with its own waveform,
// tempo and bass line. Everything is guarded so the game still runs with
// audio disabled (headless screenshots, muted tabs).

import { RADIO } from './config.js';

const STATION_PATTERNS = [
  // SOLMAR FM — sunset synth: soft square lead, slow arpeggio.
  { wave: 'triangle', bpm: 96, bass: [110, 0, 130.8, 0, 98, 0, 146.8, 0], lead: [220, 277.2, 329.6, 277.2, 220, 246.9, 293.7, 329.6] },
  // GULL ROCK — garage rock: sawtooth riff, driving bass.
  { wave: 'sawtooth', bpm: 132, bass: [82.4, 82.4, 110, 98, 82.4, 82.4, 123.5, 110], lead: [164.8, 196, 246.9, 196, 164.8, 146.8, 196, 220] },
  // TIDE LINE — lo-fi dusk: sine pads, sparse notes.
  { wave: 'sine', bpm: 72, bass: [87.3, 0, 0, 103.8, 0, 0, 98, 0], lead: [174.6, 0, 220, 0, 196, 0, 261.6, 0] },
];

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let station = 0;
  let stepTimer = null;
  let stepIndex = 0;
  let enabled = true;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    } catch {
      return false;
    }
    return true;
  }

  function beep(freq, dur, type = 'sine', vol = 0.2, when = 0) {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, vol = 0.25, lowpass = 1200) {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
  }

  function radioStep() {
    if (!ctx || !enabled) return;
    const pat = STATION_PATTERNS[station];
    const beat = 60 / pat.bpm / 2;
    const i = stepIndex % 8;
    const bass = pat.bass[i];
    const lead = pat.lead[i];
    if (bass) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = bass;
      g.gain.setValueAtTime(0.5, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + beat * 0.95);
      o.connect(g); g.connect(musicGain);
      o.start(); o.stop(ctx.currentTime + beat);
    }
    if (lead) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = pat.wave;
      o.frequency.value = lead;
      g.gain.setValueAtTime(0.28, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + beat * 0.9);
      o.connect(g); g.connect(musicGain);
      o.start(); o.stop(ctx.currentTime + beat);
    }
    stepIndex += 1;
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setStation(n) {
      station = ((n % RADIO.length) + RADIO.length) % RADIO.length;
      stepIndex = 0;
    },
    startRadio() {
      if (!ensure() || stepTimer) return;
      stepTimer = setInterval(radioStep, (60 / STATION_PATTERNS[station].bpm / 2) * 1000);
    },
    stopRadio() { if (stepTimer) { clearInterval(stepTimer); stepTimer = null; } },
    setEngine(speed, top) {
      if (!ctx || !enabled) return;
      const v = Math.abs(speed) / Math.max(1, top);
      engineGain.gain.setTargetAtTime(0.02 + v * 0.06, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(42 + v * 130, ctx.currentTime, 0.1);
    },
    skid() { noise(0.18, 0.12, 900); },
    shot() { noise(0.12, 0.4, 2600); beep(180, 0.08, 'square', 0.18); },
    punch() { noise(0.08, 0.25, 500); },
    siren() { beep(720, 0.28, 'sine', 0.05); setTimeout(() => beep(540, 0.28, 'sine', 0.05), 280); },
    crash() { noise(0.3, 0.35, 700); },
    jingle() { beep(523, 0.12, 'triangle', 0.22); beep(659, 0.12, 'triangle', 0.22, 0.12); beep(784, 0.22, 'triangle', 0.22, 0.24); },
    fail() { beep(330, 0.18, 'triangle', 0.2); beep(233, 0.3, 'triangle', 0.2, 0.18); },
    toggle() { enabled = !enabled; return enabled; },
    get enabled() { return enabled; },
  };
}
