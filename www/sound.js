// Audio built from physically modelled samples: plucked oud and qanun strings (Karplus-Strong), darbuka,
// riq tambourine, horns, whooshes and street ambience. Samples are generated once at start-up and replayed,
// which sounds far richer than raw oscillators.  Recorded Swahili voice lines are used when present in www/voice/.
const SR = 44100;
const rnd = (() => { let s = 1234567; return () => (s = (s * 16807) % 2147483647) / 1073741823.5 - 1; })();
function buffer(secs, fill) { // fill(i, t) → sample
  const n = Math.ceil(secs * SR), d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = fill(i, i / SR);
  const b = new AudioBuffer({ length: n, sampleRate: SR, numberOfChannels: 1 }); b.copyToChannel(d, 0); return b;
}
function pluck(freq, secs, decay, bright) { // Karplus-Strong plucked string
  const N = Math.round(SR / freq), ring = new Float32Array(N); let lp = 0;
  for (let i = 0; i < N; i++) { lp += (rnd() - lp) * bright; ring[i] = lp; }
  let k = 0;
  return buffer(secs, (i, t) => { const a = ring[k], b = ring[(k + 1) % N]; ring[k] = (a + b) * 0.5 * decay; k = (k + 1) % N; return a * Math.min(1, t * 400) * 0.9; });
}
const env = (t, a, d) => Math.min(1, t / a) * Math.exp(-t / d);
let lpState = 0; const lowpass = (x, k) => (lpState += (x - lpState) * k);
const SAMPLES = {};
function makeSamples() {
  if (SAMPLES.oud) return;
  SAMPLES.oud = pluck(146.83, 1.4, 0.996, 0.5);          // D3: plays the tune, pitched by playbackRate
  SAMPLES.qanun = pluck(293.66, 1.2, 0.998, 0.85);       // D4: bright plucked zither
  SAMPLES.bass = pluck(73.4, 1.0, 0.994, 0.25);
  SAMPLES.doum = buffer(0.45, (i, t) => Math.sin(2 * Math.PI * (95 - 40 * Math.min(1, t * 6)) * t) * env(t, 0.002, 0.16) * 0.95 + rnd() * env(t, 0.001, 0.008) * 0.3);
  SAMPLES.tek = buffer(0.18, (i, t) => (rnd() * 0.6 + Math.sin(2 * Math.PI * 720 * t) * 0.5) * env(t, 0.001, 0.035));
  SAMPLES.riq = buffer(0.22, (i, t) => { const x = rnd(); return (x - lowpass(x, 0.35)) * env(t, 0.002, 0.06) * (0.8 + 0.2 * Math.sin(t * 380)); });
  SAMPLES.coin = buffer(0.45, (i, t) => [1, 2.76, 5.4, 8.9].reduce((s, h, k) => s + Math.sin(2 * Math.PI * 1320 * h * t) * Math.exp(-t * (5 + k * 6)) / (k + 1.6), 0) * Math.min(1, t * 900) * 0.7);
  SAMPLES.whoosh = buffer(0.32, (i, t) => lowpass(rnd(), 0.04 + 0.5 * Math.sin(Math.PI * t / 0.32) ** 2) * Math.sin(Math.PI * t / 0.32) * 1.4);
  SAMPLES.thud = buffer(0.3, (i, t) => Math.sin(2 * Math.PI * (120 - 70 * Math.min(1, t * 8)) * t) * env(t, 0.001, 0.07) + lowpass(rnd(), 0.08) * env(t, 0.001, 0.05));
  SAMPLES.scrape = buffer(0.55, (i, t) => lowpass(rnd(), 0.35) * env(t, 0.02, 0.25) * (0.7 + 0.3 * Math.sin(t * 90)));
  SAMPLES.crash = buffer(0.7, (i, t) => rnd() * env(t, 0.001, 0.16) * 0.8 + Math.sin(2 * Math.PI * 70 * t) * env(t, 0.001, 0.12));
  SAMPLES.step = buffer(0.07, (i, t) => lowpass(rnd(), 0.18) * env(t, 0.001, 0.018) * 1.6);
  SAMPLES.tuk = buffer(0.62, (i, t) => { const on = (t < 0.16 || (t > 0.3 && t < 0.5)) ? 1 : 0, s = Math.sign(Math.sin(2 * Math.PI * 520 * t)) + Math.sign(Math.sin(2 * Math.PI * 655 * t)); return lowpass(s, 0.25) * on * 0.25; });
  SAMPLES.matatu = buffer(0.8, (i, t) => lowpass([330, 415, 494].reduce((a, f) => a + ((t * f) % 1) * 2 - 1, 0), 0.12) * env(t, 0.02, 0.5) * 0.3);
  SAMPLES.near = buffer(0.5, (i, t) => (Math.sin(2 * Math.PI * (900 - 1200 * t) * t) * 0.25 + lowpass(rnd(), 0.3) * 0.8) * Math.sin(Math.PI * t / 0.5) ** 2);
  SAMPLES.crowd = buffer(1.6, (i, t) => lowpass(rnd(), 0.06) * (0.6 + 0.4 * Math.sin(t * 17) * Math.sin(t * 5.3)) * Math.sin(Math.PI * t / 1.6) * 2.2);
  // ambience loops: the sea and a busy street
  SAMPLES.sea = buffer(6, (i, t) => lowpass(rnd(), 0.02 + 0.04 * (0.5 + 0.5 * Math.sin(t * Math.PI / 3))) * (0.6 + 0.4 * Math.sin(t * Math.PI / 3)) * 3);
  SAMPLES.street = buffer(6, (i, t) => lowpass(rnd(), 0.05) * 1.6 * (0.8 + 0.2 * Math.sin(t * 2.1)) + (t > 3.1 && t < 3.25 ? Math.sign(Math.sin(2 * Math.PI * 440 * t)) * 0.03 : 0));
}
const HIJAZ = [0, 1, 4, 5, 7, 8, 10, 12, 13, 16, 17, 19]; // D hijaz, in semitones from D3
const MELODY = [
  [7, -1, 8, 7, -1, 6, 5, -1, 4, 5, 6, -1], [7, -1, 7, 8, 9, -1, 8, 7, -1, 6, 5, -1],
  [4, -1, 5, 6, -1, 5, 4, -1, 2, 1, 2, -1], [4, 5, 6, -1, 7, -1, 5, -1, 4, -1, -1, -1],
];
const BASS = [0, 0, 3, 0];
const STEP = 0.135, BAR = 12;
function hit(ctx, dest, name, t, vol = 1, rate = 1) {
  const s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = SAMPLES[name]; s.playbackRate.value = rate; g.gain.value = vol;
  s.connect(g).connect(dest); s.start(t);
  return s;
}
const semis = n => Math.pow(2, n / 12);
function scheduleBar(ctx, dest, t0, bar, calm) { // chakacha-style 12/8 groove under an oud and qanun tune
  const mel = MELODY[bar % 4], step = STEP * (calm ? 1.25 : 1);
  for (let i = 0; i < BAR; i++) {
    const t = t0 + i * step;
    if (i === 0 || i === 6) hit(ctx, dest, 'doum', t, calm ? 0.5 : 0.9);
    if (!calm && (i === 3 || i === 8 || i === 10)) hit(ctx, dest, 'tek', t, 0.45);
    if (!calm) hit(ctx, dest, 'riq', t, i % 3 === 0 ? 0.32 : 0.14);
    if (i === 0 || i === 6 || (!calm && i === 9)) hit(ctx, dest, 'bass', t, 0.55, semis(HIJAZ[BASS[bar % 4]]));
    if (mel[i] >= 0 && (!calm || i % 2 === 0)) {
      hit(ctx, dest, 'oud', t, calm ? 0.5 : 0.62, semis(HIJAZ[mel[i]]));
      if (!calm && i % 3 === 0) hit(ctx, dest, 'qanun', t + 0.02, 0.22, semis(HIJAZ[mel[i]]));
    }
  }
  return BAR * step;
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

// Swahili voice lines: put recordings in www/voice/ and list their file names in www/voice/voices.json,
// e.g. ["mwizi.mp3", "shika_huyo.m4a"]. Names (without extension) must be one of VOICE_KEYS.
export const VOICE_KEYS = ['mwizi', 'shika_huyo', 'pole', 'aisee', 'kahawa', 'kofia', 'panda', 'umemshika', 'wamemzuia', 'twende', 'ametoroka', 'waah'];
const voices = {};
async function loadVoices() {
  let files = [];
  try { files = await (await fetch('voice/voices.json')).json(); } catch { return; }
  const dec = new OfflineAudioContext(1, 1, SR);
  await Promise.all(files.map(async file => {
    const key = file.replace(/\.[a-z0-9]+$/i, '');
    if (!VOICE_KEYS.includes(key)) return;
    try { voices[key] = await dec.decodeAudioData(await (await fetch('voice/' + file)).arrayBuffer()); } catch { /* skip a bad file */ }
  }));
}

export const Sound = {
  enabled: true, ctx: null, master: null, music: null, fx: null, amb: null, nextBar: 0, barT: 0, timer: 0, calm: true, ambSrc: null, ambName: '', vol: [0.8, 1],
  init() { makeSamples(); loadVoices(); },
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      makeSamples();
      this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      const comp = this.ctx.createDynamicsCompressor(); comp.connect(this.master);
      this.music = this.ctx.createGain(); this.fx = this.ctx.createGain(); this.amb = this.ctx.createGain();
      this.music.connect(comp); this.fx.connect(comp); this.amb.connect(comp);
      this.volumes(...this.vol);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  volumes(music, sfx) { this.vol = [music, sfx]; if (!this.music) return; this.music.gain.value = music * 0.5; this.fx.gain.value = sfx; this.amb.gain.value = sfx * 0.28; },
  start(calm = false) {
    this.unlock(); if (!this.ctx) return;
    this.calm = calm;
    if (this.timer) return;
    this.barT = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => {
      while (this.barT < this.ctx.currentTime + 0.6) this.barT += scheduleBar(this.ctx, this.music, this.barT, this.nextBar++, this.calm);
    }, 150);
  },
  ambience(name) { // 'sea' | 'street' | ''
    if (!this.ctx || name === this.ambName) return;
    if (this.ambSrc) { const old = this.ambSrc; old.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4); setTimeout(() => old.stop(), 2000); }
    this.ambName = name; this.ambSrc = null;
    if (!name) return;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); s.buffer = SAMPLES[name]; s.loop = true; g.gain.value = 0; g.gain.setTargetAtTime(1, this.ctx.currentTime, 0.6);
    s.connect(g).connect(this.amb); s.start(); s.g = g; this.ambSrc = s;
  },
  mute(m) { if (this.master) this.master.gain.value = m ? 0 : 1; },
  voice(key) { if (!this.ctx || !this.enabled || !voices[key]) return false; const s = this.ctx.createBufferSource(); s.buffer = voices[key]; s.connect(this.fx); s.start(); return true; },
  sfx(name, n = 0) {
    const c = this.ctx; if (!c || !this.enabled) return;
    const t = c.currentTime, d = this.fx;
    if (name === 'coin') hit(c, d, 'coin', t, 0.5, Math.pow(1.03, Math.min(n % 16, 14)));
    else if (name === 'jump') hit(c, d, 'whoosh', t, 0.7, 1.3);
    else if (name === 'swish') hit(c, d, 'whoosh', t, 0.45, 1.8);
    else if (name === 'slide') hit(c, d, 'scrape', t, 0.6);
    else if (name === 'land') hit(c, d, 'thud', t, 0.7);
    else if (name === 'step') hit(c, d, 'step', t, 0.35, 0.85 + (n % 2) * 0.3);
    else if (name === 'throw') hit(c, d, 'whoosh', t, 0.8, 2.2);
    else if (name === 'pick') { hit(c, d, 'coin', t, 0.4, 0.75); hit(c, d, 'coin', t + 0.09, 0.4, 1.0); }
    else if (name === 'boost') { [0, 4, 7, 12].forEach((s, i) => hit(c, d, 'qanun', t + i * 0.06, 0.5, semis(s))); hit(c, d, 'whoosh', t, 0.6, 1); }
    else if (name === 'hit') { hit(c, d, 'crash', t, 0.8); hit(c, d, 'thud', t, 0.9, 0.8); }
    else if (name === 'smash') { hit(c, d, 'crash', t, 0.9, 1.2); hit(c, d, 'thud', t, 0.6, 1.4); }
    else if (name === 'near') hit(c, d, 'near', t, 0.9);
    else if (name === 'tuk') hit(c, d, 'tuk', t, 0.5);
    else if (name === 'matatu') hit(c, d, 'matatu', t, 0.5);
    else if (name === 'crowd') hit(c, d, 'crowd', t, 0.9);
    else if (name === 'win') { [0, 4, 7, 12, 16].forEach((s, i) => { hit(c, d, 'qanun', t + i * 0.1, 0.7, semis(s)); hit(c, d, 'riq', t + i * 0.1, 0.4); }); hit(c, d, 'doum', t + 0.5, 1); }
    else if (name === 'lose') [0, -2, -5, -9].forEach((s, i) => hit(c, d, 'oud', t + i * 0.16, 0.7, semis(s)));
  },
  // offline render of the music for the share video: calm until `calmUntil` seconds, then the chase groove
  async renderWav(secs, calmUntil = 0) {
    makeSamples();
    const ctx = new OfflineAudioContext(1, Math.ceil(secs * SR), SR), g = ctx.createGain();
    g.gain.value = 0.5; g.connect(ctx.destination);
    for (let b = 0, t = 0.05; t < secs; b++) t += scheduleBar(ctx, g, t, b, t < calmUntil);
    return wavBase64(await ctx.startRendering());
  },
};
