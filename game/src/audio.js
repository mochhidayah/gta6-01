// Every sound in Palmera Bay is synthesised live with WebAudio: an
// engine hum, two-tone sirens, gunshots, pickups and three little
// radio stations that a step sequencer plays. No audio files, no
// network — nothing to download.
//
// The bank is built around two primitives: a Voice (one oscillator
// through its own gain, started once and retuned) for everything
// continuous, and short-lived bleeps and noise bursts for one-shots.
// A single pre-rendered noise buffer serves every burst, so shots
// and crashes cost no allocation while the game runs.
const STATION_DEFS = [
  { name: 'Sunset FM', scale: [110, 130.8, 164.8, 196, 220], bass: [0, 0, 2, 0, 3, 0, 4, 1] },
  { name: 'Radio Palma', scale: [98, 116.5, 146.8, 174.6, 196], bass: [0, 2, 0, 4, 0, 3, 1, 2] },
  { name: 'Night Drive', scale: [87.3, 103.8, 130.8, 155.6, 174.6], bass: [0, 0, 0, 2, 0, 0, 4, 3] },
];

// One oscillator held open for the life of the page, retuned as needed.
class Voice {
  constructor(ctx, type, destination) {
    this.osc = ctx.createOscillator();
    this.osc.type = type;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.osc.connect(this.gain);
    this.gain.connect(destination);
    this.osc.start();
  }

  retune(freq, when, glide) {
    this.osc.frequency.setTargetAtTime(freq, when, glide);
  }

  level(vol, when, glide) {
    this.gain.gain.setTargetAtTime(vol, when, glide);
  }

  stop() {
    try {
      this.osc.stop();
    } catch {
      // Already stopped — nothing to do.
    }
    this.gain.disconnect();
  }
}

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
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
    this.radioNames = STATION_DEFS.map((s) => s.name);
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
    this.renderNoise();
    this.startEngineVoice();
    this.startRadio();
  }

  // One second of white noise, rendered once and reused by every burst.
  renderNoise() {
    const c = this.ctx;
    const len = c.sampleRate;
    const buffer = c.createBuffer(1, len, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buffer;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  // --- continuous voices ---

  startEngineVoice() {
    const c = this.ctx;
    const voice = new Voice(c, 'sawtooth', this.master);
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    // Re-wire: oscillator -> filter -> gain -> master.
    voice.osc.disconnect();
    voice.osc.connect(filter);
    filter.connect(voice.gain);
    voice.osc.frequency.value = 55;
    this.engineOsc = voice.osc;
    this.engineGain = voice.gain;
  }

  setEngine(speed01, driving) {
    if (!this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, t, 0.08);
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + speed01 * 0.06 : 0.015, t, 0.1);
  }

  startSirenVoice() {
    if (this.sirenOsc || !this.ctx) return;
    const c = this.ctx;
    const voice = new Voice(c, 'triangle', this.master);
    this.sirenOsc = voice.osc;
    this.sirenGain = voice.gain;
    let high = false;
    this.sirenTimer = setInterval(() => {
      if (!this.sirenOsc) return;
      high = !high;
      this.sirenOsc.frequency.setTargetAtTime(high ? 880 : 660, c.currentTime, 0.05);
    }, 450);
  }

  setSiren(on) {
    if (on) this.startSirenVoice();
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

  // A slice of the shared noise buffer through a low-pass filter.
  burst(dur, vol = 0.2, cutoff = 1200) {
    if (!this.ctx || this.muted || !this.noiseBuf) return;
    const c = this.ctx;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + dur);
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

  // Play a little melody: notes spaced evenly in time.
  arpeggio(freqs, stepMs, dur, type = 'triangle', vol = 0.18) {
    freqs.forEach((f, i) => setTimeout(() => this.tone(f, dur, type, vol), i * stepMs));
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
    this.arpeggio([880, 1174, 1568], 60, 0.12, 'square', 0.12);
  }

  crash() {
    this.burst(0.3, 0.4, 500);
  }

  explosion() {
    this.burst(0.8, 0.6, 300);
    this.tone(60, 0.6, 'sine', 0.4);
  }

  busted() {
    this.arpeggio([392, 311], 220, 0.35, 'triangle', 0.2);
  }

  missionDone() {
    this.arpeggio([523, 659, 784, 1046], 110, 0.18);
  }

  missionFail() {
    this.arpeggio([330, 262, 196], 140, 0.22, 'triangle', 0.16);
  }

  horn() {
    this.tone(370, 0.18, 'sawtooth', 0.1);
  }

  // --- radio ---

  nextStation() {
    this.station = (this.station + 1) % STATION_DEFS.length;
    this.musicStep = 0;
    return this.radioNames[this.station];
  }

  // A tiny step sequencer: a bass pattern plus a sparkle arp per station.
  startRadio() {
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted || !this.radioOn) return;
      const def = STATION_DEFS[this.station];
      const step = this.musicStep++;
      const bassNote = def.scale[def.bass[step % def.bass.length]];
      this.tone(bassNote, 0.32, 'triangle', 0.1);
      if (step % 2 === 0) this.tone(bassNote * 4, 0.14, 'sine', 0.05);
      if (step % 4 === 3) {
        const lead = def.scale[(step * 2 + 1) % def.scale.length] * 2;
        this.tone(lead, 0.2, 'sine', 0.06);
      }
      if (step % 8 === 6) this.burst(0.05, 0.03, 6000); // hi-hat tick
    }, 240);
  }

  // Alias kept for the game code that starts the radio.
  startMusic() {
    if (!this.musicTimer) this.startRadio();
  }

  buildMusic() {
    this.startMusic();
  }

  buildEngine() {
    if (this.ctx && !this.engineOsc) this.startEngineVoice();
  }

  buildSiren() {
    this.startSirenVoice();
  }
}
