// All audio is synthesised: a coastal chakacha-style loop and a handful of effects.
const STEP = 0.135, BAR = 12; // 12/8 feel
const SCALE = [146.83, 155.56, 185.0, 196.0, 220.0, 233.08, 261.63, 293.66, 311.13, 369.99, 392.0]; // D hijaz
const MELODY = [
  [7, -1, 8, 7, -1, 6, 5, -1, 4, 5, 6, -1], [7, -1, 7, 8, 9, -1, 8, 7, -1, 6, 5, -1],
  [4, -1, 5, 6, -1, 5, 4, -1, 2, 1, 2, -1], [4, 5, 6, -1, 7, -1, 5, -1, 4, -1, -1, -1],
];
const BASS = [0, 0, 3, 0];
let noiseBuf = null;
function noise(ctx) {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); let s = 1234567;
  for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741824 - 1; }
  return noiseBuf;
}
function tone(ctx, dest, t, f, dur, type, vol, f2) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.02);
}
function hiss(ctx, dest, t, dur, vol, hp) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise(ctx); f.type = 'highpass'; f.frequency.value = hp;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(dest); s.start(t); s.stop(t + dur + 0.02);
}
function scheduleBar(ctx, dest, t0, bar) {
  const mel = MELODY[bar % 4], root = SCALE[BASS[bar % 4]] / 2;
  for (let i = 0; i < BAR; i++) {
    const t = t0 + i * STEP;
    hiss(ctx, dest, t, 0.05, i % 3 === 0 ? 0.11 : 0.05, 6000);                                // kayamba shaker
    if (i === 0 || i === 6) tone(ctx, dest, t, 150, 0.22, 'sine', 0.6, 48);                    // low drum
    if (i === 3 || i === 8 || i === 10) tone(ctx, dest, t, 320, 0.09, 'triangle', 0.3, 210);   // high drum
    if (i === 3 || i === 9) hiss(ctx, dest, t, 0.09, 0.14, 1800);                              // clap
    if (i === 0 || i === 4 || i === 6 || i === 9) tone(ctx, dest, t, root * (i === 9 ? 1.5 : 1), 0.2, 'triangle', 0.32);
    if (mel[i] >= 0) { tone(ctx, dest, t, SCALE[mel[i]] * 2, 0.24, 'sawtooth', 0.075); tone(ctx, dest, t, SCALE[mel[i]] * 2.005, 0.3, 'triangle', 0.13); }
  }
}
function wavBase64(buf) {
  const d = buf.getChannelData(0), n = d.length, out = new DataView(new ArrayBuffer(44 + n * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
  let s = ''; const u = new Uint8Array(out.buffer);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}

export const Sound = {
  enabled: true, ctx: null, master: null, music: null, nextBar: 0, barT: 0, timer: 0,
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.music = this.ctx.createGain(); this.music.gain.value = 0.55; this.music.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  start() {
    this.unlock(); if (!this.ctx || this.timer) return;
    this.barT = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => {
      while (this.barT < this.ctx.currentTime + 0.5) { scheduleBar(this.ctx, this.music, this.barT, this.nextBar++); this.barT += STEP * BAR; }
    }, 120);
  },
  mute(m) { if (this.master) this.master.gain.value = m ? 0 : 1; },
  sfx(name, n = 0) {
    const c = this.ctx; if (!c || !this.enabled) return;
    const t = c.currentTime, d = this.master;
    if (name === 'coin') tone(c, d, t, 880 * Math.pow(1.03, Math.min(n, 14)), 0.12, 'square', 0.09, 1500);
    else if (name === 'jump') tone(c, d, t, 280, 0.2, 'sine', 0.3, 620);
    else if (name === 'swish') hiss(c, d, t, 0.1, 0.12, 2500);
    else if (name === 'throw') tone(c, d, t, 700, 0.25, 'triangle', 0.25, 240);
    else if (name === 'pick') { tone(c, d, t, 520, 0.1, 'square', 0.12); tone(c, d, t + 0.09, 780, 0.14, 'square', 0.12); }
    else if (name === 'boost') [0, 1, 2, 3].forEach(i => tone(c, d, t + i * 0.07, 440 * Math.pow(1.26, i), 0.14, 'sawtooth', 0.12));
    else if (name === 'hit') { tone(c, d, t, 170, 0.3, 'sawtooth', 0.35, 50); hiss(c, d, t, 0.2, 0.3, 500); }
    else if (name === 'win') [0, 4, 7, 12, 16].forEach((s, i) => tone(c, d, t + i * 0.11, 392 * Math.pow(2, s / 12), 0.3, 'square', 0.14));
    else if (name === 'lose') [0, -2, -5, -9].forEach((s, i) => tone(c, d, t + i * 0.16, 330 * Math.pow(2, s / 12), 0.3, 'triangle', 0.22));
  },
  // offline render of the loop, used by tools/record.mjs for the video soundtrack
  async renderWav(secs) {
    const ctx = new OfflineAudioContext(1, Math.ceil(secs * 44100), 44100), g = ctx.createGain();
    g.gain.value = 0.6; g.connect(ctx.destination);
    for (let b = 0, t = 0.05; t < secs; b++, t += STEP * BAR) scheduleBar(ctx, g, t, b);
    return wavBase64(await ctx.startRendering());
  },
};
