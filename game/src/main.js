// Palmera Bay — game orchestration: the loop, stealing cars, crime
// and punishment, and saving. The Game owns the world and the
// player's state and ticks everything once a frame. Wanted-level
// rules live in police.js; the Game just asks the director.
import { SAVE_KEY, ECONOMY, distSq } from './config.js';
import { City, roadPointNear } from './city.js';
import { Traffic } from './vehicles.js';
import { Player, Crowd } from './people.js';
import { MissionManager } from './missions.js';
import { PoliceDirector } from './police.js';
import { Renderer } from './render.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { applyShot } from './shots.js';
import { StuntRamps } from './stunts.js';
import { Gangs } from './gangs.js';
import { Weather } from './weather.js';
import { seeded } from './rng.js';

export class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.canvas.width = 1280;
    this.canvas.height = 800;
    this.city = new City();
    this.traffic = new Traffic(this.city);
    this.crowd = new Crowd(this.city);
    this.missions = new MissionManager(this);
    this.stunts = new StuntRamps();
    this.gangs = new Gangs(this.city);
    this.weather = new Weather();
    this.renderer = new Renderer(this.canvas, document.getElementById('minimap'));
    this.hud = new HUD();
    this.input = new Input(this.canvas);
    this.sounds = new SoundBank();
    this.rng = seeded(99);
    // The police director uses the road helper through the game.
    this.roadPointNear = roadPointNear;

    const spawn = roadPointNear(760, 500);
    this.player = new Player(spawn.x, spawn.y);
    this.playerCar = null;
    this.cops = []; // on-foot police (owned by the director's updates)
    this.police = new PoliceDirector(this);
    this.particles = [];
    this.tracers = [];
    this.muzzles = [];
    this.cashDrops = []; // {x, y, kind, taken} — pickups lying in the world

    this.state = 'menu'; // menu | playing | paused | busted | wasted
    this.wanted = 0;
    this.crimeHeat = 0; // accumulates; crossing whole numbers raises stars
    this.lastCrimeAt = 0;
    this.clock = 0; // seconds since 17:00
    this.elapsed = 0;
    this.spawnTimer = 0;
    this.pistolSpawned = false;
    this.saveData = this.loadSave();

    this.populateWorld(spawn);
    this.restoreProgress();
    this.showStartMenu();
    this.lastT = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  populateWorld(spawn) {
    this.missions.placePackages(this.rng);
    this.crowd.spawnVendors();
    this.traffic.spawnParked(14);
    this.traffic.spawn(10, spawn.x, spawn.y);
    this.crowd.spawn(24, spawn.x, spawn.y);
    this.gangs.spawn(4, spawn.x, spawn.y);
  }

  restoreProgress() {
    this.missions.storyIndex = this.saveData.missionsDone || 0;
    this.missions.completed = this.saveData.missionsDone || 0;
    if (this.saveData.money) this.player.money = this.saveData.money;
  }

  // ---------- menus ----------

  showStartMenu() {
    this.state = 'menu';
    this.hud.showHud(false);
    const hasSave = this.saveData && this.saveData.missionsDone > 0;
    this.hud.showMenu(
      'PALMERA BAY',
      `<p class="tag">A sun-soaked open-world crime story — an original game, no borrowed city.</p>
       <p><b>Marco Solano</b> is back in Palmera Bay with $250 and a debt to pay. Ten jobs stand between him and freedom — and a helicopter is watching.</p>
       <p><b>WASD</b> move / drive &nbsp;·&nbsp; <b>E</b> steal car / buy snacks &nbsp;·&nbsp; <b>Mouse</b> aim, <b>Click</b> shoot &nbsp;·&nbsp; <b>Space</b> punch / handbrake<br>
       <b>M</b> next mission &nbsp;·&nbsp; <b>R</b> radio &nbsp;·&nbsp; <b>H</b> honk &nbsp;·&nbsp; <b>P</b> pause &nbsp;·&nbsp; <b>1</b> fists / <b>2</b> pistol</p>
       <p>Missions, taxi fares, courier runs, hidden stashes, 5-star chases with roadblocks and a helicopter.</p>
       ${hasSave ? `<p>Save found: ${this.saveData.missionsDone} mission(s) done, $${this.saveData.money} in pocket.</p>` : ''}`,
      hasSave ? 'ENTER — continue your story    ·    N — new game' : 'Press ENTER to start',
    );
  }

  startGame(fresh) {
    if (fresh) {
      this.saveData = { missionsDone: 0, money: ECONOMY.startCash };
      this.missions.storyIndex = 0;
      this.missions.completed = 0;
      this.player.money = ECONOMY.startCash;
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

  // Wanted level: thin front for the police director, which owns the rules.
  addCrime(stars, message, silent = false) {
    this.police.addCrime(stars, message, silent);
  }

  setWanted(n) {
    this.police.setWanted(n);
  }

  policeCars() {
    return this.police.policeCars();
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
    if (this.playerCar) this.exitCar();
    const hq = this.city.landmarks.policeHQ;
    this.player.x = hq.x + 40;
    this.player.y = hq.y + 40;
    this.state = 'busted';
    this.hud.showMenu(
      'BUSTED',
      `<p>The Bay Precinct picked you up outside HQ. Fine: <b>$${fine}</b>.</p><p>Marco walks out with his pockets lighter — but free.</p>`,
      'ENTER — back to the streets',
    );
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
    if (this.playerCar) {
      this.playerCar.damage(100, this);
      this.playerCar = null;
    }
    const h = this.city.landmarks.hospital;
    this.player.x = h.x + 40;
    this.player.y = h.y + 40;
    this.player.inCar = false;
    this.state = 'wasted';
    this.hud.showMenu(
      'WASTED',
      `<p>Marco wakes up at Santa Luz Hospital, $${lost} lighter.</p><p>Palmera Bay is still out there.</p>`,
      'ENTER — back to the streets',
    );
    this.saveGame();
  }

  // ---------- cars ----------

  enterCar(car) {
    if (!car || car.dead) return;
    const stolen = car.driver === 'parked' || car.driver === 'traffic';
    const hailed = car.driver === 'taxiWait';
    car.driver = null;
    this.playerCar = car;
    this.player.inCar = true;
    this.sounds.ensure();
    if (stolen) {
      this.addCrime(1, `You stole the ${car.model.name}! Someone saw that.`);
      this.crowd.scareNear(car.x, car.y, 200);
      this.sounds.horn();
    }
    if (hailed || car.taxi) this.missions.offerTaxi();
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
    a.crashCooldown = 0.6;
    b.crashCooldown = 0.6;
    this.sounds.crash();
    this.renderer.shake = Math.min(14, speed * 0.05);
    this.addParticles((a.x + b.x) / 2, (a.y + b.y) / 2, 6, '#ffb347');
    const p = this.player;
    if ((a === this.playerCar || b === this.playerCar) && speed > 150) {
      p.hurt(this.playerCar && this.playerCar.bike ? 10 : 6, this);
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
      const speed = 40 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.5 + Math.random() * 0.4,
        maxLife: 0.9,
        size: 2 + Math.random() * 3,
        color,
      });
    }
  }

  addTracer(x1, y1, x2, y2) {
    this.tracers.push({ x1, y1, x2, y2, life: 0.15 });
  }

  addMuzzle(x, y, angle) {
    this.muzzles.push({ x, y, angle, life: 0.08 });
  }

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
  }

  toast(title, body, seconds) {
    this.hud.toast(title, body, seconds);
  }

  // ---------- save ----------

  saveGame() {
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          missionsDone: this.missions.storyIndex,
          money: this.player.money,
          packages: this.missions.packagesFound,
        }),
      );
    } catch {
      // Storage unavailable — play on without saving.
    }
  }

  loadSave() {
    try {
      return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  // ---------- main loop ----------

  loop(now) {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    const input = this.input;
    if (this.state === 'playing') {
      this.updatePlaying(dt);
      return;
    }
    if (this.state === 'menu') {
      if (input.wasPressed('Enter')) this.startGame(false);
      if (input.wasPressed('KeyN')) this.startGame(true);
    } else if (this.state === 'paused') {
      if (input.wasPressed('KeyP') || input.wasPressed('Enter')) this.resumeGame();
      if (input.wasPressed('KeyM')) this.sounds.setMuted(!this.sounds.muted);
    } else if (this.state === 'busted' || this.state === 'wasted') {
      if (input.wasPressed('Enter')) {
        this.hud.hideMenu();
        this.state = 'playing';
      }
    }
    this.renderer.draw(this);
    input.endFrame();
  }

  // Hotkeys while playing: pause, mission, radio, horn, weapons, E (car/snack).
  handleHotkeys() {
    const input = this.input;
    const p = this.player;
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) this.pauseGame();
    if (input.wasPressed('KeyM')) {
      if (!this.missions.active) this.missions.startStory();
      else {
        const step = this.missions.currentStep();
        this.hud.toast('MISSION ACTIVE', step ? step.text : '', 3);
      }
    }
    if (input.wasPressed('KeyR')) {
      this.hud.toast('RADIO', `Now playing: ${this.sounds.nextStation()}`, 2);
    }
    if (input.wasPressed('KeyH')) this.sounds.horn();
    if (input.wasPressed('Digit1')) p.weapon = 'fists';
    if (input.wasPressed('Digit2')) {
      if (p.ammo > 0) p.weapon = 'pistol';
      else this.hud.toast('NO AMMO', 'Find a pistol pickup — check the pawnshop district.', 3);
    }
    if (input.wasPressed('KeyE')) {
      if (p.inCar) this.exitCar();
      else if (p.buySnack(this)) {
        // Snack bought — E was spent at the stall.
      } else {
        const car = this.traffic.nearestCar(p.x, p.y, 60, (c) => !c.dead && !c.police);
        if (car) this.enterCar(car);
      }
    }
  }

  // Advance the world one frame: traffic, crowds, gangs, police, missions, pickups.
  tickWorld(dt) {
    this.traffic.update(dt, this);
    this.crowd.update(dt, this);
    this.gangs.update(dt, this, this.rng);
    this.weather.update(dt, this);
    this.police.update(dt);
    this.missions.update(dt);
    this.missions.updateTaxi(dt);
    this.missions.updateCourier(dt);
    this.missions.checkPackages();
    this.repopulate(dt);
    this.collectPickups();
    this.tickEffects(dt);
  }

  updatePlaying(dt) {
    const input = this.input;
    const p = this.player;

    this.elapsed += dt;
    this.clock += dt;
    if (Math.floor(this.elapsed) % 30 === 0 && Math.floor(this.elapsed) !== Math.floor(this.elapsed - dt)) {
      this.saveGame();
    }

    this.handleHotkeys();

    const wx = this.input.mouse.x + this.renderer.cam.x;
    const wy = this.input.mouse.y + this.renderer.cam.y;

    if (p.inCar && this.playerCar) this.drivePlayer(dt);
    else this.walkPlayer(dt, wx, wy);

    this.tickWorld(dt);

    const fx = p.inCar ? this.playerCar.x : p.x;
    const fy = p.inCar ? this.playerCar.y : p.y;
    this.renderer.updateCamera(fx, fy, dt);
    this.renderer.draw(this);
    this.hud.update(this, dt);
    input.endFrame();
  }

  // Driving: throttle, steering, handbrake, skid smoke, running people over.
  drivePlayer(dt) {
    const input = this.input;
    const car = this.playerCar;
    let throttle = 0;
    if (input.down.KeyW || input.down.ArrowUp) throttle = 1;
    if (input.down.KeyS || input.down.ArrowDown) throttle = -1;
    let steer = 0;
    if (input.down.KeyA || input.down.ArrowLeft) steer = -1;
    if (input.down.KeyD || input.down.ArrowRight) steer = 1;
    const handbrake = !!input.down.Space;
    car.drive(throttle, steer, handbrake, dt);
    this.stunts.update(dt, car, this);
    this.sounds.setEngine(Math.abs(car.speed) / car.topSpeed, true);
    if (car.skid > 0 && Math.random() < 0.5) {
      this.particles.push({
        x: car.x - Math.cos(car.angle) * 20,
        y: car.y - Math.sin(car.angle) * 20,
        vx: 0,
        vy: 0,
        life: 0.4,
        maxLife: 0.4,
        size: 4,
        color: '#888',
      });
    }
    for (const ped of this.crowd.peds) {
      if (ped.state === 'down') continue;
      if (distSq(ped.x, ped.y, car.x, car.y) < 26 * 26 && Math.abs(car.speed) > 60) {
        ped.knockDown();
        this.addCrime(1, 'You ran someone over!');
        this.addParticles(ped.x, ped.y, 10, '#e33f2f');
        this.sounds.crash();
      }
    }
    if (car.taxi && !this.missions.taxi && !this.missions.active && Math.random() < dt * 0.15) {
      this.missions.offerTaxi();
    }
    if (!this.missions.courier && !this.missions.taxi && !this.missions.active && Math.random() < dt * 0.1) {
      this.missions.offerCourier();
    }
  }

  walkPlayer(dt, wx, wy) {
    const input = this.input;
    const p = this.player;
    p.move(input.down, dt, this);
    this.sounds.setEngine(0, false);
    if (input.down.Space) p.punch(this);
    if (input.mouse.held || input.takeClick()) {
      if (p.weapon === 'pistol') p.shoot(this, wx, wy);
    }
    if (p.weapon === 'pistol') p.aimAt(wx, wy);
  }

  repopulate(dt) {
    const p = this.player;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 3;
    const px = p.inCar ? this.playerCar.x : p.x;
    const py = p.inCar ? this.playerCar.y : p.y;
    const trafficNear = this.traffic.cars.filter((c) => c.driver === 'traffic' && !c.dead).length;
    if (trafficNear < 12) this.traffic.spawn(4, px, py);
    if (this.crowd.peds.length < 22) this.crowd.spawn(6, px, py);
    if (this.gangs.members.length < 4) this.gangs.spawn(2, px, py);
    const waiting = this.traffic.cars.some((c) => c.driver === 'taxiWait' && !c.dead);
    if (!waiting && !p.inCar && this.wanted === 0 && Math.random() < 0.35) {
      this.traffic.spawnHailedTaxi(px + 200, py + 100);
    }
    if (!this.pistolSpawned && p.weapon !== 'pistol') {
      this.pistolSpawned = true;
      const spot = this.city.landmarks.pawnshop;
      this.cashDrops.push({ x: spot.x, y: spot.y, kind: 'pistol', taken: false });
    }
  }

  collectPickups() {
    const p = this.player;
    for (const drop of this.cashDrops) {
      if (drop.taken || drop.kind !== 'pistol') continue;
      if (!p.inCar && distSq(p.x, p.y, drop.x, drop.y) < 36 * 36) {
        drop.taken = true;
        p.weapon = 'pistol';
        p.ammo = 48;
        this.sounds.pickup();
        this.hud.toast('PISTOL ACQUIRED', '48 rounds. Press 1 for fists, 2 for pistol.', 4);
      }
    }
    this.cashDrops = this.cashDrops.filter((d) => !d.taken);
  }

  tickEffects(dt) {
    for (const pt of this.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    for (const t of this.tracers) t.life -= dt;
    this.tracers = this.tracers.filter((t) => t.life > 0);
    for (const m of this.muzzles) m.life -= dt;
    this.muzzles = this.muzzles.filter((m) => m.life > 0);
  }
}

// Boot. The ?shot= staging (screenshots) hooks in before the first frame.
const game = new Game();
window.__game = game;
applyShot(game);
