// Palmera Bay radio — three stations beamed out of a dashboard dial.
// Every song is synthesized live with WebAudio oscillators: no audio
// files, no network, the whole game still ships as plain static files.
//
// v6 rewrote this file end to end: the sequencer, the station data and
// the DJ scripts are all new text, but the dial works exactly as before.
// KeyR flips stations, KeyM mutes, clicking the banner flips too. Sound
// only starts on a real gesture — a key press or a click — because the
// browser will not let it start on its own.
//
// How main.js uses it: `new Radio(game)` once, `radio.update(dt)` every
// frame, `radio.unlock()` on the first gesture, `radio.toggleMute()`
// from the pause menu. The banner is its own DOM element, so the HUD
// never has to know about it.

// ---------------------------------------------------------------------------
// Scales and stations. A song is a lead line plus a bass line. A pattern
// step is [scaleDegree, beats]; degree 0 is the tonic, negative degrees
// walk down. A null step is a rest.
// ---------------------------------------------------------------------------

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  penta: [0, 3, 5, 7, 10],
};

const STATIONS = [
  {
    id: 'palmera',
    name: 'PALMERA FM',
    freq: '88.5',
    tagline: 'Sun-soaked hits for the drive home',
    color: '#ff9f43',
    wave: 'triangle',
    bpm: 112,
    root: 57, // A3
    scale: 'major',
    dj: 'DJ Sol',
    chatter: [
      'DJ Sol riding shotgun with you — Ocean Drive is a parking lot tonight, so soak in the view, Palmera.',
      'That was the Coral Kings. Next up is one for everyone stuck behind the same bus as me.',
      'Palmera FM: the sun never sets on a good hook. Stay locked in.',
      'Shout-out to the night couriers — your request plays right after this song.',
      'If my voice is louder than your engine, you are going too slow. Fix that.',
    ],
    tracks: [
      {
        title: 'Golden Hour Drive',
        artist: 'The Coral Kings',
        lead: [[4, 1], [2, 1], [7, 1], [9, 2], [11, 1], [9, 1], [7, 2], [null, 1], [4, 1], [7, 1], [9, 1], [7, 2], [4, 1], [2, 2]],
        bass: [[0, 2], [null, 1], [5, 1], [4, 2], [null, 1], [5, 1], [0, 2], [null, 2]],
      },
      {
        title: 'Flamingo After Dark',
        artist: 'Lucia Mar',
        lead: [[7, 1], [9, 1], [11, 2], [9, 1], [7, 1], [4, 2], [null, 1], [7, 1], [9, 1], [11, 2], [9, 1], [7, 2]],
        bass: [[4, 2], [0, 2], [5, 2], [4, 2]],
      },
      {
        title: 'Salt Air Sunday',
        artist: 'The Tides',
        lead: [[0, 2], [2, 1], [4, 1], [7, 2], [4, 1], [2, 1], [0, 2], [2, 1], [4, 1], [7, 1], [9, 2], [11, 2], [9, 2]],
        bass: [[5, 1], [null, 1], [4, 1], [null, 1], [0, 1], [null, 1], [5, 2]],
      },
    ],
  },
  {
    id: 'bayrock',
    name: 'BAY ROCK',
    freq: '101.1',
    tagline: 'Loud guitars for loud nights',
    color: '#ff4757',
    wave: 'sawtooth',
    bpm: 138,
    root: 55, // G3
    scale: 'minor',
    dj: 'Rex Hammer',
    chatter: [
      'REX HAMMER! That riff just blew the roof off the studio. Worth it.',
      'Bay Rock does not play slow songs. The ocean is that way if you want slow.',
      'Caller from the docks says the Sharks are back. Caller — the Sharks never left.',
      'Crank it. The neighbours gave up on you hours ago. Commit.',
      'Next: a song loud enough to trip car alarms down the block. You were warned.',
    ],
    tracks: [
      {
        title: 'Full Throttle',
        artist: 'Vex & The Sharks',
        lead: [[0, 0.5], [3, 0.5], [5, 0.5], [0, 0.5], [7, 1], [10, 1], [7, 2], [5, 0.5], [3, 0.5], [5, 1], [0, 2]],
        bass: [[3, 1], [0, 1], [5, 1], [3, 1], [7, 2], [5, 1], [0, 1]],
      },
      {
        title: 'Engine Roar',
        artist: 'Gearhead',
        lead: [[7, 0.5], [10, 0.5], [12, 1], [10, 0.5], [7, 0.5], [5, 1], [7, 1], [10, 1], [12, 2], [null, 1], [10, 1], [7, 2]],
        bass: [[0, 2], [5, 2], [7, 2], [3, 2]],
      },
      {
        title: 'Pedal Down',
        artist: 'The Vipers',
        lead: [[5, 0.5], [3, 0.5], [7, 0.5], [10, 0.5], [12, 1], [7, 1], [10, 0.5], [7, 0.5], [5, 1], [3, 1], [0, 2]],
        bass: [[0, 1], [null, 0.5], [5, 0.5], [3, 1], [null, 0.5], [0, 0.5], [7, 1]],
      },
    ],
  },
  {
    id: 'coralnight',
    name: 'CORAL NIGHT',
    freq: '94.7',
    tagline: 'Synth waves after dark',
    color: '#7bed9f',
    wave: 'sine',
    bpm: 96,
    root: 53, // F3
    scale: 'dorian',
    dj: 'Nova',
    chatter: [
      'Nova here, riding the late wave with you. The city is prettier at 2 a.m. — trust me on this.',
      'This one is for everyone driving nowhere in particular. You know exactly who you are.',
      'Coral Night — music for headlights, harbour lights, and everything in between.',
      'Rain is rolling in off the bay. Perfect weather for what is coming next.',
      'If the cops are on your tail, this song will not save you. It will sound amazing while they try, though.',
    ],
    tracks: [
      {
        title: 'Harbour Lights',
        artist: 'Nova Wave',
        lead: [[3, 2], [2, 1], [5, 1], [7, 2], [5, 1], [3, 1], [2, 2], [null, 2], [7, 1], [5, 1], [3, 2], [5, 2]],
        bass: [[0, 2], [null, 2], [5, 2], [null, 2], [7, 2], [null, 2]],
      },
      {
        title: 'Tower Windows',
        artist: 'Midnight Static',
        lead: [[5, 2], [7, 1], [10, 1], [7, 2], [5, 1], [3, 1], [5, 2], [7, 2], [10, 2], [7, 2]],
        bass: [[0, 4], [3, 4], [7, 4], [5, 4]],
      },
      {
        title: 'Ebb Tide',
        artist: 'The Palms',
        lead: [[3, 1], [5, 1], [7, 2], [5, 1], [3, 2], [null, 1], [2, 1], [3, 1], [5, 2], [7, 2], [10, 2]],
        bass: [[5, 2], [7, 2], [0, 2], [3, 2]],
      },
    ],
  },
];

// Pursuit riff: once the wanted level hits 3 stars the sequencer layers
// this tense two-note figure over whatever is playing, and the tempo
// climbs with the heat.
const PURSUIT_RIFF = {
  lead: [[12, 0.5], [10, 0.5], [12, 0.5], [7, 1], [12, 0.5], [10, 0.5], [13, 1]],
  bass: [[0, 0.5], [6, 0.5], [0, 0.5], [6, 0.5], [6, 1], [0, 1]],
};

function midiHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function scaleNote(station, degree) {
  const steps = SCALES[station.scale];
  const octave = Math.floor(degree / steps.length);
  const index = ((degree % steps.length) + steps.length) % steps.length;
  return station.root + octave * 12 + steps[index];
}

function patternBeats(pattern) {
  let beats = 0;
  for (const [, len] of pattern) beats += len;
  return beats;
}

export class Radio {
  constructor(game) {
    this.game = game;
    this.station = 0;
    this.track = 0;
    this.playing = false;
    this.muted = false;
    this.ctx = null;
    this.master = null;
    this.clock = null;
    this.nextSlot = 0;
    this.step = 0; // sixteenth-note counter inside the current song
    this.riffStep = 0;
    this.chatTimer = 30 + Math.random() * 20;
    this.chatIndex = 0;
    this.songClock = 0;
    this.songsPlayed = 0;
    this.banner = null;
    this.bannerName = null;
    this.bannerSong = null;
    this.bannerHost = null;
    this._wasPlaying = false;
    this._makeBanner();
    this._listenKeys();
    this._pushToSoundBank();
  }

  // -- unlock + sequencer ---------------------------------------------------

  unlock() {
    this._pushToSoundBank();
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.32;
      this.master.connect(this.ctx.destination);
      this._startClock();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.playing = true;
    this._paintBanner();
  }

  _startClock() {
    if (this.clock) return;
    this.nextSlot = this.ctx.currentTime + 0.06;
    this.clock = setInterval(() => this._pump(), 25);
  }

  _pump() {
    if (!this.ctx || !this.playing) return;
    const station = STATIONS[this.station];
    const speed = this._heatTempo();
    const secondsPerBeat = 60 / (station.bpm * speed);
    while (this.nextSlot < this.ctx.currentTime + 0.12) {
      this._playStep(station, this.nextSlot, secondsPerBeat);
      this.nextSlot += secondsPerBeat * 0.25; // sixteenth steps
      this.step += 1;
    }
  }

  // Which pattern step sounds at sixteenth index `step` (0.25-beat grid)?
  _stepAt(pattern, step, secondsPerBeat) {
    let cursor = 0; // in sixteenths
    for (const [degree, beats] of pattern) {
      const length = Math.round(beats * 4);
      if (step >= cursor && step < cursor + length) {
        return { degree, start: step === cursor, dur: (cursor + length - step) * 0.25 * secondsPerBeat };
      }
      cursor += length;
    }
    return null;
  }

  _playStep(station, when, secondsPerBeat) {
    const song = station.tracks[this.track];
    const leadLen = patternBeats(song.lead) * 4;
    const bassLen = patternBeats(song.bass) * 4;
    const lead = this._stepAt(song.lead, this.step % leadLen, secondsPerBeat);
    const bass = this._stepAt(song.bass, this.step % bassLen, secondsPerBeat);
    if (lead && lead.start && lead.degree !== null) {
      this._tone(scaleNote(station, lead.degree), when, lead.dur, station.wave, 0.16);
    }
    if (bass && bass.start && bass.degree !== null) {
      this._tone(scaleNote(station, bass.degree) - 12, when, bass.dur, 'sine', 0.22);
    }
    if (this._heat() >= 3) {
      const riffLen = patternBeats(PURSUIT_RIFF.lead) * 4;
      const riff = this._stepAt(PURSUIT_RIFF.lead, this.riffStep % riffLen, secondsPerBeat);
      if (riff && riff.start && riff.degree !== null) {
        this._tone(scaleNote(station, riff.degree), when, riff.dur, 'square', 0.07);
      }
      this.riffStep += 1;
    }
    // Soft hat tick on off-beats for groove.
    if (this.step % 2 === 1) this._hiss(when, 0.03);
  }

  _tone(midi, when, dur, wave, vol) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.value = midiHz(midi);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol, when + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, when + Math.max(0.05, dur * 0.9));
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  _hiss(when, vol) {
    const len = Math.floor(this.ctx.sampleRate * 0.03);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 6000;
    src.connect(filt);
    filt.connect(gain);
    gain.connect(this.master);
    src.start(when);
  }

  // -- public controls ------------------------------------------------------

  stationName() {
    return STATIONS[this.station].name;
  }

  trackName() {
    const station = STATIONS[this.station];
    return station.tracks[this.track].title;
  }

  nextStation() {
    this.station = (this.station + 1) % STATIONS.length;
    this.track = 0;
    this.step = 0;
    this.riffStep = 0;
    this.chatTimer = 25 + Math.random() * 20;
    this._pushToSoundBank();
    this._paintBanner();
    this._djSay(`You are listening to ${STATIONS[this.station].name}.`);
  }

  prevStation() {
    this.station = (this.station - 1 + STATIONS.length) % STATIONS.length;
    this.track = 0;
    this.step = 0;
    this._pushToSoundBank();
    this._paintBanner();
  }

  nextTrack() {
    const station = STATIONS[this.station];
    this.track = (this.track + 1) % station.tracks.length;
    this.step = 0;
    this.songsPlayed += 1;
    this._paintBanner();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.32;
    this._paintBanner();
  }

  togglePlay() {
    this.playing = !this.playing;
    if (this.playing) this.unlock();
    this._paintBanner();
  }

  // -- wanted-level reaction ------------------------------------------------

  _heat() {
    const g = this.game;
    if (!g) return 0;
    if (typeof g.wanted === 'number') return g.wanted;
    if (typeof g.crimeHeat === 'number') return Math.round(g.crimeHeat);
    if (typeof g.wantedLevel === 'number') return g.wantedLevel;
    return 0;
  }

  _heatTempo() {
    const heat = this._heat();
    if (heat >= 5) return 1.35;
    if (heat >= 4) return 1.28;
    if (heat >= 3) return 1.18;
    return 1;
  }

  // -- banner ---------------------------------------------------------------

  _makeBanner() {
    const el = document.createElement('div');
    el.id = 'radio-banner';
    el.style.cssText =
      'position:fixed;right:14px;bottom:166px;z-index:40;pointer-events:auto;' +
      'font-family:ui-monospace,Menlo,Consolas,monospace;color:#fff;' +
      'background:rgba(8,10,18,.78);border:1px solid rgba(255,255,255,.18);' +
      'border-left:4px solid #ff9f43;border-radius:8px;padding:8px 12px;' +
      'min-width:210px;max-width:280px;cursor:pointer;user-select:none;' +
      'box-shadow:0 4px 18px rgba(0,0,0,.45);';
    el.innerHTML =
      '<div style="font-size:11px;letter-spacing:2px;opacity:.75">RADIO</div>' +
      '<div class="rb-channel" style="font-size:15px;font-weight:700"></div>' +
      '<div class="rb-song" style="font-size:12px;opacity:.9"></div>' +
      '<div class="rb-dj" style="font-size:11px;opacity:.6;font-style:italic"></div>';
    el.title = 'Click: next channel (R).';
    el.addEventListener('click', () => this.nextStation());
    document.body.appendChild(el);
    this.banner = el;
    this.bannerName = el.querySelector('.rb-channel');
    this.bannerSong = el.querySelector('.rb-song');
    this.bannerHost = el.querySelector('.rb-dj');
    this._paintBanner();
  }

  _paintBanner() {
    const station = STATIONS[this.station];
    const song = station.tracks[this.track];
    this.banner.style.borderLeftColor = station.color;
    this.bannerName.textContent = `${station.name} ${station.freq}`;
    this.bannerName.style.color = station.color;
    this.bannerSong.textContent = this.playing
      ? `♪ ${song.title} — ${song.artist}`
      : `♪ ${song.title} — ${song.artist} (paused — press R)`;
    this.bannerHost.textContent = `${station.tagline} · ${station.dj}`;
  }

  // Keep the HUD's radio line honest: the HUD reads the sound
  // bank's channel list, so point it at this radio's stations.
  // (The bank is built after this radio in Game, so unlock() syncs
  // again once everything exists.)
  _pushToSoundBank() {
    const bank = this.game.sounds;
    if (!bank) return;
    bank.radioNames = STATIONS.map((station) => station.name);
    bank.station = this.station;
    bank.radioOn = true;
  }

  _djSay(line) {
    const g = this.game;
    if (g && g.hud && typeof g.hud.toast === 'function') {
      g.hud.toast(STATIONS[this.station].dj, line, 4);
    }
  }

  // -- keys -----------------------------------------------------------------

  _listenKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyR') {
        this.unlock();
        this.nextStation();
      }
      // Note: KeyM mute is driven from main.js (paused menu), not here —
      // M is the mission key in gameplay, and one press must not do two jobs.
    });
    // First click anywhere also unlocks audio (autoplay policy).
    window.addEventListener('pointerdown', () => this.unlock(), { once: true });
  }

  // -- per-frame ------------------------------------------------------------

  update(dt) {
    // Advance tracks on a wall clock so songs change even while parked.
    this.songClock += dt;
    const station = STATIONS[this.station];
    const trackSeconds = patternBeats(station.tracks[this.track].lead) * (60 / (station.bpm * this._heatTempo()));
    if (this.songClock > trackSeconds * 2) {
      this.songClock = 0;
      this.nextTrack();
    }
    // DJ chatter on a slow timer, only while actually playing.
    if (this.playing) {
      this.chatTimer -= dt;
      if (this.chatTimer <= 0) {
        this.chatTimer = 40 + Math.random() * 25;
        const lines = station.chatter;
        const line = lines[this.chatIndex % lines.length];
        this.chatIndex += 1;
        this._djSay(line);
      }
    }
    // Keep the banner honest about play state.
    if (this.banner && this._wasPlaying !== this.playing) {
      this._wasPlaying = this.playing;
      this._paintBanner();
    }
  }
}

// v7: the stations keep spinning while empire money rolls in.
