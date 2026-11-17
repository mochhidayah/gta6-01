// Palmera Bay — game orchestration: loop, wanted level, cops on foot,
// entering cars, crime, busted/wasted, and saving.
import { WORLD, SAVE_KEY, clamp, dist2 } from './config.js';
import { City, roadPointNear } from './city.js';
import { Car, Traffic } from './vehicles.js';
import { Player, Crowd, Ped } from './people.js';
import { MissionManager } from './missions.js';
import { Renderer } from './render.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { applyShot } from './shots.js';
import { mulberry32, range } from './rng.js';

export class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.canvas.width = 1280;
    this.canvas.height = 800;
    this.city = new City();
    this.traffic = new Traffic(this.city);
    this.crowd = new Crowd(this.city);
    this.missions = new MissionManager(this);
    this.renderer = new Renderer(this.canvas, document.getElementById('minimap'));
    this.hud = new HUD();
    this.input = new Input(this.canvas);
    this.sounds = new SoundBank();
    this.rng = mulberry32(99);

    const spawn = roadPointNear(760, 500);
    this.player = new Player(spawn.x, spawn.y);
    this.playerCar = null;
    this.cops = [];            // on-foot police
    this.particles = [];
    this.tracers = [];
    this.muzzles = [];
    this.cashDrops = [];

    this.state = 'menu';       // menu | playing | paused | busted | wasted
    this.wanted = 0;
    this.crimeHeat = 0;        // accumulates; crossing thresholds raises stars
    this.lastCrimeAt = 0;
    this.clock = 0;            // seconds since 17:00
    this.elapsed = 0;
    this.spawnTimer = 0;
    this.policeTimer = 0;
    this.copTimer = 0;
    this.saveData = this.loadSave();

    this.missions.placePackages(this.rng);
    this.traffic.spawnParked(14);
    this.traffic.spawn(10, spawn.x, spawn.y);
    this.crowd.spawn(24, spawn.x, spawn.y);
    this.missions.storyIndex = this.saveData.missionsDone || 0;
    this.missions.completed = this.saveData.missionsDone || 0;
    if (this.saveData.money) this.player.money = this.saveData.money;

    this.showStartMenu();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    this.lastT = performance.now();
  }

  // ---------- menus ----------
  showStartMenu() {
    this.state = 'menu';
    this.hud.showHud(false);
    const hasSave = this.saveData && this.saveData.missionsDone > 0;
    this.hud.showMenu(
      'PALMERA BAY',
      `<p class="tag">A sun-soaked open-world crime story — an original game, no borrowed city.</p>
       <p><b>Marco Solano</b> is back in Palmera Bay with $250 and a debt to pay. Six jobs stand between him and freedom.</p>
       <p><b>WASD</b> move / drive &nbsp;·&nbsp; <b>E</b> steal &amp; enter car &nbsp;·&nbsp; <b>Mouse</b> aim, <b>Click</b> shoot &nbsp;·&nbsp; <b>Space</b> punch / handbrake<br>
       <b>M</b> next mission &nbsp;·&nbsp; <b>R</b> radio &nbsp;·&nbsp; <b>P</b> pause &nbsp;·&nbsp; <b>1</b> fists / <b>2</b> pistol</p>
       <p>Missions, taxi fares, hidden cash stashes, 5-star police chases — and the whole city is yours.</p>
       ${hasSave ? `<p>Save found: ${this.saveData.missionsDone} mission(s) done, $${this.saveData.money} in pocket.</p>` : ''}`,
      hasSave ? 'ENTER — continue your story    ·    N — new game' : 'Press ENTER to start',
    );
  }

  startGame(fresh) {
    if (fresh) {
      this.saveData = { missionsDone: 0, money: 250 };
      this.missions.storyIndex = 0;
      this.missions.completed = 0;
      this.player.money = 250;
      this.player.health = 100;
      this.wanted = 0;
      this.crimeHeat = 0;
    }
    this.sounds.ensure();
    this.state = 'playing';
    this.hud.hideMenu();
    this.hud.showHud(true);
    this.hud.toast('PALMERA BAY', 'Welcome back, Marco. Press M to take the next job.', 5);
  }

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.hud.showMenu('PAUSED', '<p>Take a breath, Marco. The city waits.</p>', 'P / ENTER — resume &nbsp;·&nbsp; M — mute sound');
  }

  resumeGame() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.hideMenu();
  }

  // ---------- wanted / crime ----------
  addCrime(stars, message, silent = false) {
    if (this.state !== 'playing') return;
    this.crimeHeat += stars;
    this.lastCrimeAt = this.elapsed;
    if (!silent && message) this.hud.toast('WANTED', message, 3);
    const target = Math.min(5, Math.floor(this.crimeHeat));
    if (target > this.wanted) {
      this.wanted = target;
      this.sounds.setSiren(this.wanted > 0);
      if (this.wanted >= 3) this.hud.toast('HEAT IS ON', `${this.wanted}-star wanted level — the precinct is coming.`, 4);
    }
  }

  setWanted(n) {
    this.wanted = Math.max(0, Math.min(5, n));
    this.crimeHeat = Math.max(this.crimeHeat, this.wanted);
    this.sounds.setSiren(this.wanted > 0);
  }

  updateWanted(dt) {
    if (this.wanted === 0) return;
    // No fresh crime for a while and no police in sight: heat fades.
    const policeNear = this.policeCars() > 0 || this.cops.length > 0;
    if (this.elapsed - this.lastCrimeAt > 12 && !policeNear) {
      this.crimeHeat -= dt / 8;
      const target = Math.max(0, Math.floor(this.crimeHeat));
      if (target < this.wanted) {
        this.wanted = target;
        if (this.wanted === 0) {
          this.sounds.setSiren(false);
          this.hud.toast('CLEAN', 'You slipped away. The heat is off — for now.', 4);
        }
      }
    }
  }

  policeCars() {
    return this.traffic.cars.filter((c) => c.police && !c.dead).length;
  }

  spawnPolice(dt) {
    if (this.wanted === 0) return;
    const p = this.player;
    this.policeTimer -= dt;
    const wantCount = this.wanted >= 4 ? 4 : this.wanted >= 2 ? 3 : 1;
    if (this.policeTimer <= 0 && this.policeCars() < wantCount) {
      this.policeTimer = 2.5;
      const px = p.inCar ? this.playerCar.x : p.x;
      const py = p.inCar ? this.playerCar.y : p.y;
      const ang = Math.random() * Math.PI * 2;
      const d = 700 + Math.random() * 300;
      const pos = roadPointNear(px + Math.cos(ang) * d, py + Math.sin(ang) * d);
      const car = this.traffic.spawnPolice(pos.x, pos.y, Math.atan2(py - pos.y, px - pos.x));
      car.siren = true;
      this.sounds.horn();
    }
    // On-foot cops when the player is on foot and wanted.
    this.copTimer -= dt;
    if (!p.inCar && this.wanted >= 1 && this.copTimer <= 0 && this.cops.length < Math.min(3, this.wanted)) {
      this.copTimer = 4;
      const ang = Math.random() * Math.PI * 2;
      const cx = p.x + Math.cos(ang) * 380;
      const cy = p.y + Math.sin(ang) * 380;
      const cop = new Ped(cx, cy, this.rng);
      cop.color = '#20242e';
      cop.speed = 120 + this.wanted * 12;
      cop.state = 'walk';
      this.cops.push(cop);
    }
  }

  updateCops(dt) {
    const p = this.player;
    for (const cop of this.cops) {
      if (cop.state === 'down') continue;
      const dx = p.x - cop.x, dy = p.y - cop.y;
      const d = Math.hypot(dx, dy);
      if (d < 26) { this.bustPlayer(); return; }
      cop.angle = Math.atan2(dy, dx);
      const sp = p.inCar ? cop.speed * 0.4 : cop.speed;
      cop.x += Math.cos(cop.angle) * sp * dt;
      cop.y += Math.sin(cop.angle) * sp * dt;
      const push = this.city.collideCircle(cop.x, cop.y, cop.r);
      if (push) { cop.x += push.x; cop.y += push.y; }
    }
    this.cops = this.cops.filter((c) => c.state !== 'down' || dist2(c.x, c.y, p.x, p.y) < 700 * 700);
  }

  bustPlayer() {
    if (this.state !== 'playing') return;
    const fine = Math.min(this.player.money, 150 + this.wanted * 50);
    this.player.money -= fine;
    this.player.health = 60;
    this.setWanted(0);
    this.cops = [];
    for (const c of this.traffic.cars) if (c.police) c.dead = true;
    this.sounds.busted();
    this.sounds.setSiren(false);
    if (this.playerCar) { this.exitCar(); }
    const hq = this.city.landmarks.policeHQ;
    this.player.x = hq.x + 40; this.player.y = hq.y + 40;
    this.state = 'busted';
    this.hud.showMenu('BUSTED', `<p>The Bay Precinct picked you up outside HQ. Fine: <b>$${fine}</b>.</p><p>Marco walks out with his pockets lighter — but free.</p>`, 'ENTER — back to the streets');
    this.saveGame();
  }

  wasted() {
    if (this.state !== 'playing') return;
    const lost = Math.min(this.player.money, 200);
    this.player.money -= lost;
    this.player.health = 100;
    this.setWanted(0);
    this.cops = [];
    for (const c of this.traffic.cars) if (c.police) c.dead = true;
    this.sounds.explosion();
    if (this.playerCar) { this.playerCar.damage(100, this); this.playerCar = null; }
    const h = this.city.landmarks.hospital;
    this.player.x = h.x + 40; this.player.y = h.y + 40;
    this.player.inCar = false;
    this.state = 'wasted';
    this.hud.showMenu('WASTED', `<p>Marco wakes up at Santa Luz Hospital, $${lost} lighter.</p><p>Palmera Bay is still out there.</p>`, 'ENTER — back to the streets');
    this.saveGame();
  }

  // ---------- cars ----------
  enterCar(car) {
    if (!car || car.dead) return;
    const wasParked = car.driver === 'parked';
    const wasTraffic = car.driver === 'traffic';
    car.driver = null;
    this.playerCar = car;
    this.player.inCar = true;
    this.sounds.ensure();
    if (wasParked || wasTraffic) {
      this.addCrime(1, `You stole the ${car.model.name}! Someone saw that.`);
      this.crowd.scareNear(car.x, car.y, 200);
      this.sounds.horn();
    }
  }

  exitCar() {
    if (!this.playerCar) return;
    const car = this.playerCar;
    const side = car.angle + Math.PI / 2;
    this.player.x = car.x + Math.cos(side) * 34;
    this.player.y = car.y + Math.sin(side) * 34;
    this.player.angle = car.angle;
    this.player.inCar = false;
    this.playerCar = null;
    car.driver = 'parked';
    car.speed = 0;
  }

  onCarCrash(a, b, speed) {
    if (speed < 60) return;
    if (a.crashCooldown > 0 || b.crashCooldown > 0) return;
    a.crashCooldown = 0.6; b.crashCooldown = 0.6;
    this.sounds.crash();
    this.renderer.shake = Math.min(14, speed * 0.05);
    this.addParticles((a.x + b.x) / 2, (a.y + b.y) / 2, 6, '#ffb347');
    const p = this.player;
    if ((a === this.playerCar || b === this.playerCar) && speed > 150) {
      p.hurt(6, this);
      this.addCrime(0.4, '', true);
    }
    a.damage(speed * 0.06, this);
    b.damage(speed * 0.06, this);
    this.crowd.scareNear((a.x + b.x) / 2, (a.y + b.y) / 2, 160);
  }

  // ---------- effects ----------
  addParticles(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 120;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.4, maxLife: 0.9, size: 2 + Math.random() * 3, color,
      });
    }
  }

  addTracer(x1, y1, x2, y2) { this.tracers.push({ x1, y1, x2, y2, life: 0.15 }); }
  addMuzzle(x, y, angle) { this.muzzles.push({ x, y, angle, life: 0.08 }); }

  explode(x, y, n) {
    this.addParticles(x, y, n, '#ff7a2f');
    this.addParticles(x, y, n / 2, '#ffd23f');
    this.sounds.explosion();
    this.renderer.shake = 16;
    this.crowd.scareNear(x, y, 320);
  }

  addCash(amount, x, y) {
    if (amount > 0) {
      this.player.money += amount;
      this.sounds.cash();
      this.hud.toast('PICKED UP', `+$${amount}`, 1.5);
    }
    this.cashDrops.push({ x, y, life: 0 });
  }

  toast(title, body, seconds) { this.hud.toast(title, body, seconds); }

  // ---------- save ----------
  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        missionsDone: this.missions.storyIndex,
        money: this.player.money,
        packages: this.missions.packagesFound,
      }));
    } catch { /* storage unavailable — play on without saving */ }
  }

  loadSave() {
    try {
      return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    } catch { return {}; }
  }

  // ---------- main loop ----------
  loop(now) {
    requestAnimationFrame(this.loop);
    let dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    const input = this.input;
    const p = this.player;

    if (this.state === 'menu') {
      if (input.wasPressed('Enter')) this.startGame(false);
      if (input.wasPressed('KeyN')) this.startGame(true);
      this.renderer.draw(this);
      input.endFrame();
      return;
    }
    if (this.state === 'paused') {
      if (input.wasPressed('KeyP') || input.wasPressed('Enter')) this.resumeGame();
      if (input.wasPressed('KeyM')) { this.sounds.setMuted(!this.sounds.muted); }
      this.renderer.draw(this);
      input.endFrame();
      return;
    }
    if (this.state === 'busted' || this.state === 'wasted') {
      if (input.wasPressed('Enter')) {
        this.hud.hideMenu();
        this.state = 'playing';
      }
      this.renderer.draw(this);
      input.endFrame();
      return;
    }

    // ---- playing ----
    this.elapsed += dt;
    this.clock += dt;
    if (Math.floor(this.elapsed) % 30 === 0 && Math.floor(this.elapsed) !== Math.floor(this.elapsed - dt)) this.saveGame();

    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) this.pauseGame();
    if (input.wasPressed('KeyM')) {
      if (!this.missions.active) this.missions.startStory();
      else this.hud.toast('MISSION ACTIVE', this.missions.currentStep() ? this.missions.currentStep().text : '', 3);
    }
    if (input.wasPressed('KeyR')) {
      const name = this.sounds.nextStation();
      this.hud.toast('RADIO', `Now playing: ${name}`, 2);
    }
    if (input.wasPressed('Digit1')) { p.weapon = 'fists'; }
    if (input.wasPressed('Digit2')) {
      if (p.ammo > 0) { p.weapon = 'pistol'; } else this.hud.toast('NO AMMO', 'Find a pistol pickup — check the pawnshop district.', 3);
    }
    if (input.wasPressed('KeyE')) {
      if (p.inCar) this.exitCar();
      else {
        const car = this.traffic.nearestCar(p.x, p.y, 60, (c) => !c.dead && !c.police);
        if (car) this.enterCar(car);
      }
    }

    // World-space mouse position for aiming.
    const wx = this.input.mouse.x + this.renderer.cam.x;
    const wy = this.input.mouse.y + this.renderer.cam.y;

    if (p.inCar && this.playerCar) {
      const car = this.playerCar;
      let throttle = 0;
      if (input.keys['KeyW'] || input.keys['ArrowUp']) throttle = 1;
      if (input.keys['KeyS'] || input.keys['ArrowDown']) throttle = -1;
      let steer = 0;
      if (input.keys['KeyA'] || input.keys['ArrowLeft']) steer = -1;
      if (input.keys['KeyD'] || input.keys['ArrowRight']) steer = 1;
      const handbrake = !!input.keys['Space'];
      car.drive(throttle, steer, handbrake, dt);
      this.sounds.setEngine(Math.abs(car.speed) / car.topSpeed, true);
      // Skid smoke + marks.
      if (car.skid > 0 && Math.random() < 0.5) {
        this.particles.push({ x: car.x - Math.cos(car.angle) * 20, y: car.y - Math.sin(car.angle) * 20, vx: 0, vy: 0, life: 0.4, maxLife: 0.4, size: 4, color: '#888' });
      }
      // Running over pedestrians is a crime — and they notice.
      for (const ped of this.crowd.peds) {
        if (ped.state === 'down') continue;
        if (dist2(ped.x, ped.y, car.x, car.y) < 26 * 26 && Math.abs(car.speed) > 60) {
          ped.knockDown();
          this.addCrime(1, 'You ran someone over!');
          this.addParticles(ped.x, ped.y, 10, '#e33f2f');
          this.sounds.crash();
        }
      }
      // Taxi fare offer in a taxi.
      if (car.taxi && !this.missions.taxi && !this.missions.active && Math.random() < dt * 0.15) {
        this.missions.offerTaxi();
      }
    } else {
      p.move(input.keys, dt, this);
      this.sounds.setEngine(0, false);
      if (input.keys['Space']) p.punch(this);
      if (input.mouse.down || input.consumeClick()) {
        if (p.weapon === 'pistol') p.shoot(this, wx, wy);
      }
      if (p.weapon === 'pistol') p.aimAt(wx, wy);
    }

    // Traffic, peds, cops, missions.
    this.traffic.update(dt, this);
    this.crowd.update(dt, this);
    this.updateCops(dt);
    this.spawnPolice(dt);
    this.updateWanted(dt);
    this.missions.update(dt);
    this.missions.updateTaxi(dt);
    this.missions.checkPackages();

    // Keep the streets populated near the player.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 3;
      const px = p.inCar ? this.playerCar.x : p.x;
      const py = p.inCar ? this.playerCar.y : p.y;
      const trafficNear = this.traffic.cars.filter((c) => c.driver === 'traffic' && !c.dead).length;
      if (trafficNear < 12) this.traffic.spawn(4, px, py);
      if (this.crowd.peds.length < 22) this.crowd.spawn(6, px, py);
      // Pistol pickup near the pawnshop, once.
      if (!this.pistolSpawned && p.weapon !== 'pistol') {
        this.pistolSpawned = true;
        const ps = this.city.landmarks.pawnshop;
        this.cashDrops.push({ x: ps.x, y: ps.y, life: 0, pistol: true });
      }
    }

    // Pistol pickup.
    for (const drop of this.cashDrops) {
      if (drop.pistol && !p.inCar && dist2(p.x, p.y, drop.x, drop.y) < 36 * 36) {
        drop.pistol = false;
        p.weapon = 'pistol';
        p.ammo = 48;
        this.sounds.pickup();
        this.hud.toast('PISTOL ACQUIRED', '48 rounds. Press 1 for fists, 2 for pistol.', 4);
      }
    }
    this.cashDrops = this.cashDrops.filter((d) => !d.pistol);

    // Particles.
    for (const pt of this.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    for (const t of this.tracers) t.life -= dt;
    this.tracers = this.tracers.filter((t) => t.life > 0);
    for (const m of this.muzzles) m.life -= dt;
    this.muzzles = this.muzzles.filter((m) => m.life > 0);

    // Camera + render + HUD.
    const fx = p.inCar ? this.playerCar.x : p.x;
    const fy = p.inCar ? this.playerCar.y : p.y;
    this.renderer.updateCamera(fx, fy, dt);
    this.renderer.draw(this);
    this.hud.update(this, dt);
    input.endFrame();
  }
}

// Boot. The ?shot= staging (screenshots) hooks in before the first frame.
const game = new Game();
window.__game = game;
applyShot(game);
