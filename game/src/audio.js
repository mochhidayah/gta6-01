// All sound is synthesised live with WebAudio — no audio files, no network.
// Engine hum, sirens, gunshots, pickups and three little radio stations.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.radioOn = true;
    this.station = 0; // 0 Sunset FM, 1 Radio Palma, 2 Night Drive
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.radioNames = ['Sunset FM', 'Radio Palma', 'Night Drive'];
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startEngine();
    this.startMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  startEngine() {
    const c = this.ctx;
    this.engineOsc = c.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 320;
    this.engineGain = c.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(filt); filt.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  setEngine(speed01, driving) {
    if (!this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, t, 0.08);
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + speed01 * 0.06 : 0.015, t, 0.1);
  }

  startSiren() {
    if (this.sirenOsc || !this.ctx) return;
    const c = this.ctx;
    this.sirenOsc = c.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenGain = c.createGain();
    this.sirenGain.gain.value = 0.0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    let hi = false;
    this.sirenTimer = setInterval(() => {
      if (!this.sirenOsc) return;
      hi = !hi;
      this.sirenOsc.frequency.setTargetAtTime(hi ? 880 : 660, c.currentTime, 0.05);
    }, 450);
  }

  setSiren(on) {
    if (on) this.startSiren();
    if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
  }

  blip(freq, dur, type = 'square', vol = 0.12) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur);
  }

  noise(dur, vol = 0.2, filterFreq = 1200) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = filterFreq;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t);
  }

  gunshot() { this.noise(0.14, 0.35, 2500); this.blip(160, 0.08, 'square', 0.18); }
  punch() { this.noise(0.08, 0.2, 700); }
  pickup() { this.blip(660, 0.09); setTimeout(() => this.blip(990, 0.12), 70); }
  cash() { this.blip(880, 0.08); setTimeout(() => this.blip(1174, 0.1), 60); setTimeout(() => this.blip(1568, 0.14), 120); }
  crash() { this.noise(0.3, 0.4, 500); }
  explosion() { this.noise(0.8, 0.6, 300); this.blip(60, 0.6, 'sine', 0.4); }
  busted() { this.blip(392, 0.25, 'triangle', 0.2); setTimeout(() => this.blip(311, 0.4, 'triangle', 0.2), 220); }
  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'triangle', 0.18), i * 110));
  }
  missionFail() { [330, 262, 196].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.16), i * 140)); }
  horn() { this.blip(370, 0.18, 'sawtooth', 0.1); }

  nextStation() {
    this.station = (this.station + 1) % 3;
    this.musicStep = 0;
    return this.radioNames[this.station];
  }

  // Tiny step sequencer: a bass line + sparkle arp per station.
  startMusic() {
    const scales = [
      [110, 130.8, 164.8, 196, 220],   // Sunset FM — warm major
      [98, 116.5, 146.8, 174.6, 196],  // Radio Palma — latin-ish minor
      [87.3, 103.8, 130.8, 155.6, 174.6], // Night Drive — deep minor
    ];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted || !this.radioOn) return;
      const scale = scales[this.station];
      const s = this.musicStep++;
      const bass = scale[s % scale.length];
      this.note(bass, 0.32, 'triangle', 0.10);
      if (s % 2 === 0) this.note(bass * 4, 0.14, 'sine', 0.05);
      if (s % 4 === 3) this.note(scale[(s * 2 + 1) % scale.length] * 2, 0.2, 'sine', 0.06);
      if (s % 8 === 6) this.noise(0.05, 0.03, 6000); // hat tick
    }, 240);
  }

  note(freq, dur, type, vol) {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur);
  }
}
