// Palmera Bay radio — three in-game stations, procedural chiptune songs,
// DJ chatter, and a wanted-level reactive tempo. No audio files: every
// note is synthesized live with WebAudio oscillators, so the game still
// ships as plain static files with zero network requests.
//
// Wiring (main.js): const radio = new Radio(game); radio.update(dt) every
// frame; radio draws its own banner element, so no HUD changes are needed.
// KeyR cycles stations, KeyM toggles mute. Audio starts on the first user
// gesture (a key press or click) because browsers block autoplay.

// ---------------------------------------------------------------------------
// Station and track data. A track is a lead pattern plus a bass pattern.
// A pattern step is [scaleDegree, beats]; degree 0 is the tonic, negative
// degrees walk down the scale. Rests are null steps.
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
      'DJ Sol here — traffic on Ocean Drive is a nightmare, so stay in your lane, Palmera!',
      'That was the Coral Kings, and this next one goes out to everyone stuck behind a bus.',
      'Palmera FM, where the sun never sets on a good hook. Keep it locked.',
      'Shout-out to the night-shift couriers — your request is coming up after this one.',
      'If you can hear me over your engine, you are driving too fast. Slow down. Or do not. I am not a cop.',
    ],
    tracks: [
      {
        title: 'Sunset Boulevard Run',
        artist: 'The Coral Kings',
        lead: [[0, 1], [2, 1], [4, 1], [7, 2], [4, 1], [2, 1], [0, 2], [null, 1], [4, 1], [7, 1], [9, 2], [7, 1], [4, 1], [2, 2]],
        bass: [[0, 2], [null, 1], [0, 1], [4, 2], [null, 1], [5, 1], [4, 2], [null, 2]],
      },
      {
        title: 'Flamingo Nights',
        artist: 'Lucia Mar',
        lead: [[7, 1], [9, 1], [11, 2], [9, 1], [7, 1], [4, 2], [2, 1], [4, 1], [7, 2], [null, 1], [9, 1], [7, 1], [4, 2]],
        bass: [[0, 2], [3, 2], [4, 2], [5, 2]],
      },
      {
        title: 'Boardwalk Breeze',
        artist: 'The Tides',
        lead: [[4, 2], [2, 1], [0, 1], [2, 2], [4, 1], [7, 1], [9, 1], [7, 2], [4, 2], [2, 2], [0, 2]],
        bass: [[0, 1], [null, 1], [4, 1], [null, 1], [5, 1], [null, 1], [4, 2]],
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
      'REX HAMMER! That last riff broke my desk. In a good way. Probably.',
      'Bay Rock does not do slow songs. If you want slow, go listen to the ocean.',
      'Caller from the docks says the Sharks are back in town. Caller, the Sharks never left.',
      'Turn it up. Your neighbours already hate you. Commit to it.',
      'Next up, a track so loud it sets off car alarms. You have been warned.',
    ],
    tracks: [
      {
        title: 'Redline',
        artist: 'Vex & The Sharks',
        lead: [[0, 0.5], [0, 0.5], [3, 0.5], [0, 0.5], [5, 1], [7, 1], [10, 2], [7, 0.5], [5, 0.5], [3, 1], [0, 2]],
        bass: [[0, 1], [0, 1], [3, 1], [5, 1], [7, 2], [5, 1], [3, 1]],
      },
      {
        title: 'Midnight Piston',
        artist: 'Gearhead',
        lead: [[7, 0.5], [10, 0.5], [12, 1], [10, 0.5], [7, 0.5], [5, 1], [3, 1], [5, 1], [7, 2], [null, 1], [10, 1], [12, 2]],
        bass: [[0, 2], [5, 2], [3, 2], [7, 2]],
      },
      {
        title: 'No Brakes',
        artist: 'The Vipers',
        lead: [[0, 0.5], [3, 0.5], [5, 0.5], [7, 0.5], [10, 1], [12, 1], [10, 0.5], [7, 0.5], [5, 1], [3, 1], [0, 2]],
        bass: [[0, 1], [null, 0.5], [0, 0.5], [5, 1], [null, 0.5], [3, 0.5], [7, 1]],
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
      'Nova here, riding the late wave with you. The city looks better at 2 a.m. Trust me.',
      'This next track is for everyone driving nowhere in particular. You know who you are.',
      'Coral Night — music for headlights, harbour lights, and everything in between.',
      'The rain is coming in off the bay. Perfect weather for this next one.',
      'If the cops are behind you, this song is not going to help. But it will sound great.',
    ],
    tracks: [
      {
        title: 'Neon Harbour',
        artist: 'Nova Wave',
        lead: [[0, 2], [2, 1], [3, 1], [7, 2], [5, 1], [3, 1], [2, 2], [null, 2], [7, 1], [9, 1], [10, 2], [7, 2]],
        bass: [[0, 2], [null, 2], [5, 2], [null, 2], [3, 2], [null, 2]],
      },
      {
        title: 'Glass Towers',
        artist: 'Midnight Static',
        lead: [[5, 2], [7, 1], [10, 1], [12, 2], [10, 1], [7, 1], [5, 2], [3, 2], [2, 2], [0, 2]],
        bass: [[0, 4], [3, 4], [5, 4], [7, 4]],
      },
      {
        title: 'Low Tide',
        artist: 'The Palms',
        lead: [[7, 1], [5, 1], [3, 2], [2, 1], [0, 2], [null, 1], [3, 1], [5, 1], [7, 2], [10, 2], [7, 2]],
        bass: [[0, 2], [7, 2], [5, 2], [3, 2]],
      },
    ],
  },
];

// Pursuit overlay: when the wanted level is 3 or higher the sequencer layers
// this tense two-note figure over whatever is playing, and the tempo rises.
const PURSUIT = {
  lead: [[12, 0.5], [10, 0.5], [12, 0.5], [13, 1], [12, 0.5], [10, 0.5], [7, 1]],
  bass: [[0, 0.5], [0, 0.5], [0, 0.5], [0, 0.5], [6, 1], [0, 1]],
};

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function degreeToMidi(station, degree) {
  const scale = SCALES[station.scale];
  const oct = Math.floor(degree / scale.length);
  const idx = ((degree % scale.length) + scale.length) % scale.length;
  return station.root + oct * 12 + scale[idx];
}

export class Radio {
  constructor(game) {
    this.game = game;
    this.stationIndex = 0;
    this.trackIndex = 0;
    this.playing = false;
    this.muted = false;
    this.ctx = null;
    this.master = null;
    this.timer = null;
    this.nextNoteTime = 0;
    this.step = 0; // sixteenth-note counter inside the current track
    this.pursuitStep = 0;
    this.chatterTimer = 30 + Math.random() * 20;
    this.chatterIndex = 0;
    this.banner = null;
    this.bannerText = null;
    this.bannerDj = null;
    this.tracksPlayed = 0;
    this._buildBanner();
    this._bindKeys();
    this._syncHud();
  }

  // Keep the HUD's radio line honest: the HUD reads the sound
  // bank's station list, so point it at this radio's stations.
  // (The bank is built after this radio in Game, so unlock() syncs
  // again once everything exists.)
  _syncHud() {
    const s = this.game.sounds;
    if (!s) return;
    s.radioNames = STATIONS.map((st) => st.name);
    s.station = this.stationIndex;
    s.radioOn = true;
  }

  // -- DOM banner -----------------------------------------------------------
  _buildBanner() {
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
      '<div class="rb-station" style="font-size:15px;font-weight:700"></div>' +
      '<div class="rb-track" style="font-size:12px;opacity:.9"></div>' +
      '<div class="rb-dj" style="font-size:11px;opacity:.6;font-style:italic"></div>';
    el.title = 'Click: next station (R).';
    el.addEventListener('click', () => this.nextStation());
    document.body.appendChild(el);
    this.banner = el;
    this.bannerText = el.querySelector('.rb-station');
    this.bannerTrack = el.querySelector('.rb-track');
    this.bannerDj = el.querySelector('.rb-dj');
    this._refreshBanner();
  }

  _refreshBanner() {
    const st = STATIONS[this.stationIndex];
    const tr = st.tracks[this.trackIndex];
    this.banner.style.borderLeftColor = st.color;
    this.bannerText.textContent = `${st.name} ${st.freq}`;
    this.bannerText.style.color = st.color;
    this.bannerTrack.textContent = this.playing
      ? `♪ ${tr.title} — ${tr.artist}`
      : `♪ ${tr.title} — ${tr.artist} (paused — press R)`;
    this.bannerDj.textContent = `${st.tagline} · ${st.dj}`;
  }

  // -- keys -----------------------------------------------------------------
  _bindKeys() {
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

  // -- audio graph ----------------------------------------------------------
  unlock() {
    this._syncHud();
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.32;
      this.master.connect(this.ctx.destination);
      this._startSequencer();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.playing = true;
    this._refreshBanner();
  }

  _startSequencer() {
    if (this.timer) return;
    this.nextNoteTime = this.ctx.currentTime + 0.06;
    this.timer = setInterval(() => this._scheduleAhead(), 25);
  }

  _scheduleAhead() {
    if (!this.ctx || !this.playing) return;
    const st = STATIONS[this.stationIndex];
    const tempoMult = this._wantedTempo();
    const spb = 60 / (st.bpm * tempoMult); // seconds per beat
    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this._playStep(st, this.nextNoteTime, spb);
      const leadLen = this._patternBeats(st.tracks[this.trackIndex].lead);
      const bassLen = this._patternBeats(st.tracks[this.trackIndex].bass);
      const barBeats = Math.max(leadLen, bassLen);
      this.nextNoteTime += spb * 0.25; // sixteenth steps
      this.step += 1;
      if (this.step >= barBeats * 4) {
        this.step = 0;
        this.tracksPlayed += 0; // track advance handled by wall clock below
      }
    }
  }

  _patternBeats(pattern) {
    let total = 0;
    for (const [, beats] of pattern) total += beats;
    return total;
  }

  // Which pattern step sounds at sixteenth index `step` (0.25-beat grid)?
  _stepAt(pattern, step, spb) {
    let cursor = 0; // in sixteenths
    for (const [degree, beats] of pattern) {
      const len = Math.round(beats * 4);
      if (step >= cursor && step < cursor + len) {
        return { degree, start: step === cursor, dur: (cursor + len - step) * 0.25 * spb };
      }
      cursor += len;
    }
    return null;
  }

  _playStep(st, when, spb) {
    const tr = st.tracks[this.trackIndex];
    const lead = this._stepAt(tr.lead, this.step % (this._patternBeats(tr.lead) * 4), spb);
    const bass = this._stepAt(tr.bass, this.step % (this._patternBeats(tr.bass) * 4), spb);
    if (lead && lead.start && lead.degree !== null) {
      this._note(degreeToMidi(st, lead.degree), when, lead.dur, st.wave, 0.16);
    }
    if (bass && bass.start && bass.degree !== null) {
      this._note(degreeToMidi(st, bass.degree) - 12, when, bass.dur, 'sine', 0.22);
    }
    if (this._wanted() >= 3) {
      const p = this._stepAt(PURSUIT.lead, this.pursuitStep % (this._patternBeats(PURSUIT.lead) * 4), spb);
      if (p && p.start && p.degree !== null) {
        this._note(degreeToMidi(st, p.degree), when, p.dur, 'square', 0.07);
      }
      this.pursuitStep += 1;
    }
    // Soft hat tick on off-beats for groove.
    if (this.step % 2 === 1) this._hat(when, 0.03);
  }

  _note(midi, when, dur, wave, vol) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.value = midiToFreq(midi);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol, when + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, when + Math.max(0.05, dur * 0.9));
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  _hat(when, vol) {
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

  // -- wanted-level reaction -------------------------------------------------
  _wanted() {
    const g = this.game;
    if (!g) return 0;
    if (typeof g.wanted === 'number') return g.wanted;
    if (typeof g.crimeHeat === 'number') return Math.round(g.crimeHeat);
    if (typeof g.wantedLevel === 'number') return g.wantedLevel;
    return 0;
  }

  _wantedTempo() {
    const w = this._wanted();
    if (w >= 5) return 1.35;
    if (w >= 4) return 1.28;
    if (w >= 3) return 1.18;
    return 1;
  }

  // -- public controls -------------------------------------------------------
  nextStation() {
    this.stationIndex = (this.stationIndex + 1) % STATIONS.length;
    this.trackIndex = 0;
    this.step = 0;
    this.pursuitStep = 0;
    this.chatterTimer = 25 + Math.random() * 20;
    this._syncHud();
    this._refreshBanner();
    this._sayDj(`You are listening to ${STATIONS[this.stationIndex].name}.`);
  }

  prevStation() {
    this.stationIndex = (this.stationIndex - 1 + STATIONS.length) % STATIONS.length;
    this.trackIndex = 0;
    this.step = 0;
    this._syncHud();
    this._refreshBanner();
  }

  nextTrack() {
    const st = STATIONS[this.stationIndex];
    this.trackIndex = (this.trackIndex + 1) % st.tracks.length;
    this.step = 0;
    this.tracksPlayed += 1;
    this._refreshBanner();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.32;
    this._refreshBanner();
  }

  togglePlay() {
    this.playing = !this.playing;
    if (this.playing) this.unlock();
    this._refreshBanner();
  }

  stationName() {
    return STATIONS[this.stationIndex].name;
  }

  trackName() {
    const st = STATIONS[this.stationIndex];
    return st.tracks[this.trackIndex].title;
  }

  _sayDj(line) {
    const g = this.game;
    if (g && g.hud && typeof g.hud.toast === 'function') {
      g.hud.toast(STATIONS[this.stationIndex].dj, line, 4);
    }
  }

  // -- per-frame --------------------------------------------------------------
  update(dt) {
    // Advance tracks on a wall clock so songs change even while parked.
    this._trackClock = (this._trackClock || 0) + dt;
    const st = STATIONS[this.stationIndex];
    const trackLen = this._patternBeats(st.tracks[this.trackIndex].lead) * (60 / (st.bpm * this._wantedTempo()));
    if (this._trackClock > trackLen * 2) {
      this._trackClock = 0;
      this.nextTrack();
    }
    // DJ chatter on a slow timer, only while actually playing.
    if (this.playing) {
      this.chatterTimer -= dt;
      if (this.chatterTimer <= 0) {
        this.chatterTimer = 40 + Math.random() * 25;
        const lines = st.chatter;
        const line = lines[this.chatterIndex % lines.length];
        this.chatterIndex += 1;
        this._sayDj(line);
      }
    }
    // Keep the banner honest about play state.
    if (this.banner && this._lastPlaying !== this.playing) {
      this._lastPlaying = this.playing;
      this._refreshBanner();
    }
  }
}
