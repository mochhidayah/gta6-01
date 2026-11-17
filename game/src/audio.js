// Every sound in Palmera Bay is synthesised live with WebAudio:
// engine hum, two-tone sirens, gunshots, pickups and three little
// radio stations. No audio files, no network — nothing to download.
const STATIONS = [
  { name: 'Sunset FM', scale: [110, 130.8, 164.8, 196, 220] }, // warm major
  { name: 'Radio Palma', scale: [98, 116.5, 146.8, 174.6, 196] }, // latin-ish minor
  { name: 'Night Drive', scale: [87.3, 103.8, 130.8, 155.6, 174.6] }, // deep minor
];

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.radioOn = true;
    this.station = 0;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.radioNames = STATIONS.map((s) => s.name);
  }

  // Create the audio graph on the first user gesture; browsers demand it.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.buildEngine();
    this.buildMusic();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  // --- continuous voices ---

  buildEngine() {
    const c = this.ctx;
    this.engineOsc = c.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.engineGain = c.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  setEngine(speed01, driving) {
    if (!this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, t, 0.08);
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + speed01 * 0.06 : 0.015, t, 0.1);
  }

  buildSiren() {
    if (this.sirenOsc || !this.ctx) return;
    const c = this.ctx;
    this.sirenOsc = c.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenGain = c.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    let high = false;
    this.sirenTimer = setInterval(() => {
      if (!this.sirenOsc) return;
      high = !high;
      this.sirenOsc.frequency.setTargetAtTime(high ? 880 : 660, c.currentTime, 0.05);
    }, 450);
  }

  setSiren(on) {
    if (on) this.buildSiren();
    if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
  }

  // --- one-shot helpers ---

  // A short pitched tone that decays away.
  tone(freq, dur, type = 'square', vol = 0.12) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur);
  }

  // Filtered noise burst (impacts, shots, crashes).
  burst(dur, vol = 0.2, cutoff = 1200) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx;
    const t = c.currentTime;
    const len = Math.floor(c.sampleRate * dur);
    const buffer = c.createBuffer(1, len, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = c.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  // Keep the old short names as aliases — the game calls these.
  blip(freq, dur, type, vol) {
    this.tone(freq, dur, type, vol);
  }

  noise(dur, vol, cutoff) {
    this.burst(dur, vol, cutoff);
  }

  note(freq, dur, type, vol) {
    this.tone(freq, dur, type, vol);
  }

  // --- game effects ---

  gunshot() {
    this.burst(0.14, 0.35, 2500);
    this.tone(160, 0.08, 'square', 0.18);
  }

  punch() {
    this.burst(0.08, 0.2, 700);
  }

  pickup() {
    this.tone(660, 0.09);
    setTimeout(() => this.tone(990, 0.12), 70);
  }

  cash() {
    this.tone(880, 0.08);
    setTimeout(() => this.tone(1174, 0.1), 60);
    setTimeout(() => this.tone(1568, 0.14), 120);
  }

  crash() {
    this.burst(0.3, 0.4, 500);
  }

  explosion() {
    this.burst(0.8, 0.6, 300);
    this.tone(60, 0.6, 'sine', 0.4);
  }

  busted() {
    this.tone(392, 0.25, 'triangle', 0.2);
    setTimeout(() => this.tone(311, 0.4, 'triangle', 0.2), 220);
  }

  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'triangle', 0.18), i * 110));
  }

  missionFail() {
    [330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.16), i * 140));
  }

  horn() {
    this.tone(370, 0.18, 'sawtooth', 0.1);
  }

  // --- radio ---

  nextStation() {
    this.station = (this.station + 1) % STATIONS.length;
    this.musicStep = 0;
    return this.radioNames[this.station];
  }

  // A tiny step sequencer: bass line plus a sparkle arp per station.
  buildMusic() {
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted || !this.radioOn) return;
      const scale = STATIONS[this.station].scale;
      const step = this.musicStep++;
      const bass = scale[step % scale.length];
      this.tone(bass, 0.32, 'triangle', 0.1);
      if (step % 2 === 0) this.tone(bass * 4, 0.14, 'sine', 0.05);
      if (step % 4 === 3) this.tone(scale[(step * 2 + 1) % scale.length] * 2, 0.2, 'sine', 0.06);
      if (step % 8 === 6) this.burst(0.05, 0.03, 6000); // hi-hat tick
    }, 240);
  }

  // Alias kept for the game code that starts the radio.
  startMusic() {
    if (!this.musicTimer) this.buildMusic();
  }
}
