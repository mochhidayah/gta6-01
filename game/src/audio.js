// Every sound in Palmera Bay is synthesised live with WebAudio:
// an engine hum, two-tone sirens, gunshots, pickups and three
// little radio stations a step sequencer plays. No audio files,
// no network — nothing to download. v6 rewrote this file wholesale
// — same voices, same effects — with one rule carried over from v4:
// the bank's own radio sequencer never starts in ensure(), because
// radio.js owns the music now (two sequencers at once sounded like
// a fight).
const OLD_STATIONS = [
  { name: 'Sunset FM', scale: [110, 130.8, 164.8, 196, 220], bass: [0, 0, 2, 0, 3, 0, 4, 1] },
  { name: 'Radio Palma', scale: [98, 116.5, 146.8, 174.6, 196], bass: [0, 2, 0, 4, 0, 3, 1, 2] },
  { name: 'Night Drive', scale: [87.3, 103.8, 130.8, 155.6, 174.6], bass: [0, 0, 0, 2, 0, 0, 4, 3] },
];

// One oscillator held open for the life of the page, retuned as needed.
class Tone {
  constructor(ctx, type, destination) {
    this.osc = ctx.createOscillator();
    this.osc.type = type;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.osc.connect(this.gain);
    this.gain.connect(destination);
    this.osc.start();
  }

  // (Tones are retuned through oscillator/amp directly by the bank.)
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
    this.radioNames = OLD_STATIONS.map((s) => s.name);
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
    this.makeNoise();
    this.bootEngine();
    // No startRadio() here any more: radio.js owns the music.
  }

  // One second of white noise, rendered once and reused by every burst.
  makeNoise() {
    const ac = this.ctx;
    const len = ac.sampleRate;
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buffer;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  // --- one-shot helpers ---

  // A short pitched tone that decays away.
  tone(freq, dur, type = 'square', vol = 0.12) {
    if (!this.ctx || this.muted) return;
    const ac = this.ctx;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + dur);
  }

  // A slice of the shared noise buffer through a low-pass filter.
  burst(dur, vol = 0.2, cutoff = 1200) {
    if (!this.ctx || this.muted || !this.noiseBuf) return;
    const ac = this.ctx;
    const now = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(now);
    src.stop(now + dur);
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

  // A taxi's double-beep: two short honks, "I'm here, hop in."
  hornTaxi() {
    this.tone(440, 0.12, 'sawtooth', 0.1);
    setTimeout(() => this.tone(440, 0.12, 'sawtooth', 0.1), 140);
  }

  // The helicopter's rotor wash: a low chopped burst as it comes over.
  heliBuzz() {
    this.burst(0.9, 0.25, 400);
    this.tone(90, 0.9, 'sawtooth', 0.08);
  }

  // Distant thunder rolling in with the rain.
  thunder() {
    this.burst(1.4, 0.35, 180);
  }

  // A happy little chime for a snack bought at a stall.
  snack() {
    this.arpeggio([784, 988], 90, 0.12, 'triangle', 0.16);
  }

  // A bright fanfare for an achievement or a finished challenge.
  achievement() {
    this.arpeggio([659, 784, 988, 1318], 90, 0.16, 'triangle', 0.2);
  }

  // A camera shutter: a click and a whirr for photo mode.
  shutter() {
    this.burst(0.05, 0.3, 4000);
    setTimeout(() => this.tone(1200, 0.06, 'sine', 0.08), 90);
  }

  // Race countdown: one beep per second, then a go!
  countBeep() {
    this.tone(440, 0.14, 'square', 0.16);
  }

  countGo() {
    this.arpeggio([660, 880], 90, 0.2, 'square', 0.18);
  }

  // The race winner's fanfare — bigger than a mission chime.
  raceWin() {
    this.arpeggio([523, 659, 784, 1046, 1318], 100, 0.2, 'square', 0.16);
  }

  // --- continuous voices ---

  bootEngine() {
    const ac = this.ctx;
    const voice = new Tone(ac, 'sawtooth', this.master);
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    // Re-wire: oscillator -> filter -> amp -> master.
    voice.osc.disconnect();
    voice.osc.connect(filter);
    filter.connect(voice.gain);
    voice.osc.frequency.value = 55;
    this.engineOsc = voice.osc;
    this.engineGain = voice.gain;
  }

  setEngine(speed01, driving) {
    if (!this.engineOsc) return;
    const now = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, now, 0.08);
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + speed01 * 0.06 : 0.015, now, 0.1);
  }

  bootSiren() {
    if (this.sirenOsc || !this.ctx) return;
    const ac = this.ctx;
    const voice = new Tone(ac, 'triangle', this.master);
    this.sirenOsc = voice.osc;
    this.sirenGain = voice.gain;
    let high = false;
    this.sirenTimer = setInterval(() => {
      if (!this.sirenOsc) return;
      high = !high;
      this.sirenOsc.frequency.setTargetAtTime(high ? 880 : 660, ac.currentTime, 0.05);
    }, 450);
  }

  setSiren(on) {
    if (on) this.bootSiren();
    if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
  }

  // --- radio (legacy: radio.js owns the music in v4) ---

  nextStation() {
    this.station = (this.station + 1) % OLD_STATIONS.length;
    this.musicStep = 0;
    return this.radioNames[this.station];
  }

  // A tiny step sequencer: a bass pattern plus a sparkle arp per station.
  // Kept for compatibility; nothing starts it any more.
  startRadio() {
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted || !this.radioOn) return;
      const def = OLD_STATIONS[this.station];
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
}
