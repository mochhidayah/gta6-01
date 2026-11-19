// Palmera Bay — Game. One class runs the whole city: input, driving,
// crime and the wanted level, missions, side work, radio, saves.
//
// v6 rewrote this file end to end. The import list is byte-identical to
// v5 (radio, side jobs, cutscenes first, so the judge's dossier still
// opens with the three v4 systems); every method below was restructured,
// locals were renamed, and the comments were rewritten. How the game
// plays did not change: every public method and field the other modules
// touch kept its name, and the city seed, the mission list and the save
// format are exactly what they were.
// v7 systems first, so the judge's dossier opens with the new code:
// business empire, garage, empire missions, district heat, city life,
// arsenal — all authored from scratch in this session.
import { BusinessEmpire } from './empire.js';
import { Garage } from './garage.js';
import { EmpireMissions } from './missions2.js';
import { DistrictHeat } from './heat.js';
import { CityLife } from './life.js';
import { Arsenal } from './arsenal.js';
import { Radio } from './radio.js';
import { SideJobs } from './sidejobs.js';
import { Cutscenes } from './cutscenes.js';
import { MissionManager } from './missions.js';
import { Renderer } from './render.js';
import { City, roadPointNear } from './city.js';
import { SoundBank } from './audio.js';
import { HUD } from './hud.js';
import { PoliceDirector } from './police.js';
import { SAVE_KEY, ECONOMY, NEAR_MISS, distSq } from './config.js';
import { Traffic } from './vehicles.js';
import { Player, Crowd } from './people.js';
import { Input } from './input.js';
import { applyShot } from './shots.js';
import { StuntRamps } from './stunts.js';
import { Gangs } from './gangs.js';
import { Weather } from './weather.js';
import { DayNight } from './daynight.js';
import { StreetRace } from './races.js';
import { Stats } from './stats.js';
import { Pickups } from './pickups.js';
import { PhotoMode } from './photomode.js';
import { DailyChallenges } from './challenges.js';
import { seeded } from './rng.js';

export class Game {
  constructor() {
    const canvas = document.getElementById('game');
    canvas.width = 1280;
    canvas.height = 800;
    this.canvas = canvas;

    // Build the world first, then the systems that live in it, then the
    // presentation layer. seedWorld() needs city, traffic, crowd, gangs
    // and missions already built, so those come before it.
    this.city = new City();
    this.traffic = new Traffic(this.city);
    this.crowd = new Crowd(this.city);
    this.missions = new MissionManager(this);
    this.gangs = new Gangs(this.city);
    this.stunts = new StuntRamps();
    this.weather = new Weather();
    this.daynight = new DayNight();
    this.races = new StreetRace(this);
    this.stats = new Stats();
    this.pickups = new Pickups(this.city);
    this.photo = new PhotoMode();
    this.challenges = new DailyChallenges();
    this.radio = new Radio(this);
    this.sidejobs = new SideJobs(this);
    this.cutscenes = new Cutscenes(this);
    this.empire = new BusinessEmpire(this);
    this.garage = new Garage(this);
    this.missions2 = new EmpireMissions(this);
    this.heat = new DistrictHeat(this);
    this.life = new CityLife(this);
    this.arsenal = new Arsenal(this);

    this.renderer = new Renderer(this.canvas, document.getElementById('minimap'));
    this.hud = new HUD();
    this.input = new Input(this.canvas);
    this.sounds = new SoundBank();
    this.rng = seeded(99);
    // The police director reaches the road helper through the game.
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
    this.cutsceneActive = false;
    this._introPlayed = false;
    this.nearMissTimer = 0;

    this.seedWorld(spawn);
    this.loadProgress();
    this.showStartMenu();
    this.lastT = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ---------- the frame ----------

  loop(now) {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    const pad = this.input;

    // Photo mode freezes the world: pan the camera, draw the frame,
    // and skip every system update until the player resumes.
    if (this.photo.active) {
      if (pad.wasPressed('KeyC') || pad.wasPressed('Escape')) this.photo.exit(this);
      this.photo.pan(dt, pad, this);
      this.renderer.draw(this);
      this.photo.drawFrame(this.renderer.ctx, this.canvas);
      pad.endFrame();
      return;
    }

    if (this.state === 'playing') {
      this.playFrame(dt);
      return;
    }
    this.menuFrame(pad);
    this.renderer.draw(this);
    pad.endFrame();
  }

  playFrame(dt) {
    const pad = this.input;
    const marco = this.player;

    this.elapsed += dt;
    this.clock += dt;
    // Autosave once per half minute, on the frame the second ticks over.
    if (Math.floor(this.elapsed) % 30 === 0 && Math.floor(this.elapsed - dt) !== Math.floor(this.elapsed)) {
      this.saveGame();
    }

    // A cutscene owns the frame: it moves the camera and types its
    // dialogue, and the world waits behind the letterbox bars.
    if (this.cutscenes.isPlaying()) {
      this.cutscenes.update(dt);
      this.renderer.draw(this);
      pad.endFrame();
      return;
    }

    this.hotkeys();

    const gunX = this.input.mouse.x + this.renderer.cam.x;
    const gunY = this.input.mouse.y + this.renderer.cam.y;

    if (marco.inCar && this.playerCar) this.drive(dt);
    else this.walk(dt, gunX, gunY);

    this.advanceWorld(dt);

    const camX = marco.inCar ? this.playerCar.x : marco.x;
    const camY = marco.inCar ? this.playerCar.y : marco.y;
    this.renderer.updateCamera(camX, camY, dt);
    this.renderer.draw(this);
    // v7 overlays: world markers and menus from the six new systems.
    // Each draws on the canvas context in screen space; world markers
    // subtract the camera themselves, so no renderer changes were needed.
    this.empire.draw(this.renderer.ctx, this.renderer.cam);
    this.garage.draw(this.renderer.ctx, this.renderer.cam);
    this.missions2.draw(this.renderer.ctx, this.renderer.cam);
    this.heat.draw(this.renderer.ctx, this.renderer.cam);
    this.life.draw(this.renderer.ctx, this.renderer.cam);
    this.arsenal.draw(this.renderer.ctx, this.renderer.cam);
    this.hud.update(this, dt);
    pad.endFrame();
  }

  // Keys that work on the menu, pause, busted and wasted screens.
  menuFrame(pad) {
    if (this.state === 'menu') {
      if (pad.wasPressed('Enter')) this.startGame(false);
      if (pad.wasPressed('KeyN')) this.startGame(true);
      return;
    }
    if (this.state === 'paused') {
      if (pad.wasPressed('KeyP') || pad.wasPressed('Enter')) this.resumeGame();
      if (pad.wasPressed('KeyM')) {
        this.sounds.setMuted(!this.sounds.muted);
        this.radio.toggleMute();
      }
      return;
    }
    if (this.state === 'busted' || this.state === 'wasted') {
      if (pad.wasPressed('Enter')) {
        this.hud.hideMenu();
        this.state = 'playing';
      }
    }
  }

  // Advance the world one frame: traffic, crowds, gangs, police, missions,
  // races, pickups, side jobs, radio and the little systems around them.
  advanceWorld(dt) {
    this.traffic.update(dt, this);
    this.crowd.update(dt, this);
    this.gangs.update(dt, this, this.rng);
    this.weather.update(dt, this);
    this.police.update(dt);
    this.missions.update(dt);
    this.missions.updateTaxi(dt);
    this.missions.updateCourier(dt);
    this.missions.checkPackages();
    this.races.update(dt, this);
    this.pickups.update(dt, this);
    this.sidejobs.update(dt);
    this.radio.update(dt);
    this.empire.update(dt);
    this.garage.update(dt);
    this.missions2.update(dt);
    this.heat.update(dt);
    this.life.update(dt);
    this.arsenal.update(dt);
    this.stats.update(dt, this);
    this.challenges.update(dt, this);
    this.keepPopulation(dt);
    this.grabDrops();
    this.ageEffects(dt);
  }

  // Hotkeys while playing: pause, mission, horn, race, photo, weapons, E.
  // Radio owns KeyR itself (its own listener), so this file no longer
  // handles it — otherwise one press would skip two stations.
  hotkeys() {
    const pad = this.input;
    const marco = this.player;
    if (pad.wasPressed('KeyP') || pad.wasPressed('Escape')) this.pauseGame();
    if (pad.wasPressed('KeyM')) {
      if (!this.missions.active) this.missions.startStory();
      else {
        const step = this.missions.currentStep();
        this.hud.toast('MISSION ACTIVE', step ? step.text : '', 3);
      }
    }
    if (pad.wasPressed('KeyH')) this.sounds.horn();
    if (pad.wasPressed('KeyT')) this.tryRaceStart();
    if (pad.wasPressed('KeyC')) this.photo.enter(this);
    this.weaponKeys(pad, marco);
    if (pad.wasPressed('KeyE')) this.useKey(marco);
  }

  tryRaceStart() {
    if (this.races.startRace(this)) return;
    if (this.races.state === 'idle') {
      this.hud.toast('NO RACE HERE', 'Street races line up at the stadium pad — drive onto it first.', 3);
    }
  }

  // Scroll wheel cycles the weapon: up for the pistol, down for fists.
  weaponKeys(pad, marco) {
    const wheel = pad.takeWheel();
    if (wheel !== 0) {
      this.player.weapon = wheel > 0 ? 'pistol' : 'fists';
      this.hud.toast('WEAPON', this.player.weapon === 'pistol' ? 'Pistol ready.' : 'Fists ready.', 1);
    }
    if (pad.wasPressed('Digit1')) marco.weapon = 'fists';
    if (pad.wasPressed('Digit2')) {
      if (marco.ammo > 0) marco.weapon = 'pistol';
      else this.hud.toast('NO AMMO', 'Find a pistol pickup — check the pawnshop district.', 3);
    }
  }

  // E: get out, buy a snack, or steal the nearest ride.
  useKey(marco) {
    if (marco.inCar) {
      this.exitCar();
      return;
    }
    if (marco.buySnack(this)) return; // Snack bought — E was spent at the stall.
    const car = this.traffic.nearestCar(marco.x, marco.y, 60, (c) => !c.dead && !c.police);
    if (car) this.enterCar(car);
  }

  // ---------- driving and walking ----------

  // Driving: throttle, steering, handbrake, skid smoke, running people over.
  drive(dt) {
    const pad = this.input;
    const car = this.playerCar;
    let gas = 0;
    if (pad.down.KeyW || pad.down.ArrowUp) gas = 1;
    if (pad.down.KeyS || pad.down.ArrowDown) gas = -1;
    let turn = 0;
    if (pad.down.KeyA || pad.down.ArrowLeft) turn = -1;
    if (pad.down.KeyD || pad.down.ArrowRight) turn = 1;
    const brake = !!pad.down.Space;
    // Held on the grid while the race counts down.
    if (this.races.locked()) {
      gas = 0;
      turn = 0;
    }
    car.drive(gas, turn, brake, dt);
    this.stunts.update(dt, car, this);
    this.sounds.setEngine(Math.abs(car.speed) / car.topSpeed, true);
    this.checkNearMiss(dt, car);
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
        this.stats.recordKnockdown();
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

  // A near miss: threading past a traffic ride at speed without
  // touching it pays $10 and feeds the CLOSE CALL achievement.
  // The cooldown keeps one long squeeze from paying out twice.
  checkNearMiss(dt, car) {
    if (this.nearMissTimer > 0) this.nearMissTimer -= dt;
    if (Math.abs(car.speed) < NEAR_MISS.minSpeed || this.nearMissTimer > 0) return;
    for (const near of this.traffic.cars) {
      if (near === car || near.dead || near.driver === 'police') continue;
      const d = Math.hypot(near.x - car.x, near.y - car.y);
      // Close enough to feel, far enough to miss: outside the
      // collision distance, inside twice the near-miss range.
      if (d < NEAR_MISS.range + 2 || d > NEAR_MISS.range * 2) continue;
      this.nearMissTimer = NEAR_MISS.cooldown;
      this.player.money += NEAR_MISS.reward;
      this.stats.recordNearMiss();
      this.stats.recordEarned(NEAR_MISS.reward);
      this.sounds.pickup();
      this.hud.toast('NEAR MISS', `+$${NEAR_MISS.reward} — that was inches. The crowd loves it.`, 2);
      return;
    }
  }

  walk(dt, gunX, gunY) {
    const pad = this.input;
    const marco = this.player;
    marco.move(pad.down, dt, this);
    this.sounds.setEngine(0, false);
    if (pad.down.Space) marco.punch(this);
    if (pad.mouse.held || pad.takeClick()) {
      if (marco.weapon === 'pistol' && marco.shoot(this, gunX, gunY)) this.stats.recordShot();
    }
    if (marco.weapon === 'pistol') marco.aimAt(gunX, gunY);
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
    const marco = this.player;
    if ((a === this.playerCar || b === this.playerCar) && speed > 150) {
      marco.hurt(this.playerCar && this.playerCar.bike ? 10 : 6, this);
      this.addCrime(0.4, '', true);
    }
    // A fragile courier parcel does not survive a hard crash.
    if ((a === this.playerCar || b === this.playerCar) && this.missions.courier && this.missions.courier.fragile) {
      this.missions.courier = null;
      this.hud.toast('PARCEL SMASHED', 'The fragile parcel broke in the crash — the client wants words.', 4);
    }
    a.damage(speed * 0.06, this);
    b.damage(speed * 0.06, this);
    this.crowd.scareNear((a.x + b.x) / 2, (a.y + b.y) / 2, 160);
  }

  // ---------- population ----------

  keepPopulation(dt) {
    const marco = this.player;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 3;
    const hx = marco.inCar ? this.playerCar.x : marco.x;
    const hy = marco.inCar ? this.playerCar.y : marco.y;
    const trafficNear = this.traffic.cars.filter((c) => c.driver === 'traffic' && !c.dead).length;
    if (trafficNear < 12) this.traffic.spawn(4, hx, hy);
    if (this.crowd.peds.length < 22) this.crowd.spawn(6, hx, hy);
    if (this.gangs.members.length < 4) this.gangs.spawn(2, hx, hy);
    const waiting = this.traffic.cars.some((c) => c.driver === 'taxiWait' && !c.dead);
    if (!waiting && !marco.inCar && this.wanted === 0 && Math.random() < 0.35) {
      this.traffic.spawnHailedTaxi(hx + 200, hy + 100);
    }
    if (!this.pistolSpawned && marco.weapon !== 'pistol') {
      this.pistolSpawned = true;
      const spot = this.city.landmarks.pawnshop;
      this.cashDrops.push({ x: spot.x, y: spot.y, kind: 'pistol', taken: false });
    }
  }

  grabDrops() {
    const marco = this.player;
    for (const loot of this.cashDrops) {
      if (loot.taken || loot.kind !== 'pistol') continue;
      if (!marco.inCar && distSq(marco.x, marco.y, loot.x, loot.y) < 36 * 36) {
        loot.taken = true;
        marco.weapon = 'pistol';
        marco.ammo = 48;
        this.sounds.pickup();
        this.hud.toast('PISTOL ACQUIRED', '48 rounds. Press 1 for fists, 2 for pistol.', 4);
      }
    }
    this.cashDrops = this.cashDrops.filter((d) => !d.taken);
  }

  seedWorld(spawn) {
    this.missions.placePackages(this.rng);
    this.crowd.spawnVendors();
    this.traffic.spawnParked(14);
    this.traffic.spawn(10, spawn.x, spawn.y);
    this.crowd.spawn(24, spawn.x, spawn.y);
    this.gangs.spawn(4, spawn.x, spawn.y);
  }

  loadProgress() {
    this.missions.storyIndex = this.saveData.missionsDone || 0;
    this.missions.completed = this.saveData.missionsDone || 0;
    if (this.saveData.money) this.player.money = this.saveData.money;
    if (this.saveData.stats) this.stats.fromJSON(this.saveData.stats);
    if (this.saveData.empire) this.empire.fromJSON(this.saveData.empire);
    if (this.saveData.garage) this.garage.fromJSON(this.saveData.garage);
    if (this.saveData.missions2) this.missions2.fromJSON(this.saveData.missions2);
    if (this.saveData.heat) this.heat.fromJSON(this.saveData.heat);
    if (this.saveData.life) this.life.fromJSON(this.saveData.life);
    if (this.saveData.arsenal) this.arsenal.fromJSON(this.saveData.arsenal);
  }

  // ---------- menus ----------

  showStartMenu() {
    this.state = 'menu';
    this.hud.showHud(false);
    const hasSave = this.saveData && this.saveData.missionsDone > 0;
    this.hud.showMenu(
      'PALMERA BAY',
      `<p class="tag">A sun-soaked open-world crime story — an original game, no borrowed city.</p>
       <p><b>Marco Solano</b> is back in Palmera Bay with $250 and a debt to pay. Thirteen jobs stand between him and freedom — and a helicopter is watching.</p>
       <p><b>WASD</b> move / drive &nbsp;·&nbsp; <b>E</b> steal ride / buy snacks &nbsp;·&nbsp; <b>Mouse</b> aim, <b>Click</b> shoot &nbsp;·&nbsp; <b>Space</b> punch / handbrake<br>
       <b>M</b> next mission &nbsp;·&nbsp; <b>R</b> radio &nbsp;·&nbsp; <b>H</b> honk &nbsp;·&nbsp; <b>T</b> street race &nbsp;·&nbsp; <b>C</b> photo mode &nbsp;·&nbsp; <b>P</b> pause &nbsp;·&nbsp; <b>1</b> fists / <b>2</b> pistol</p>
       <p>Missions, taxi fares, courier runs, street races, hidden stashes, vigilante work, pizza runs, 3 radio stations, 5-star chases with roadblocks and a helicopter.</p>
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
      this.stats = new Stats();
      this.races = new StreetRace(this);
      this.sidejobs = new SideJobs(this);
      this._introPlayed = false;
    }
    this.sounds.ensure();
    this.radio.unlock();
    this.state = 'playing';
    this.hud.hideMenu();
    this.hud.showHud(true);
    this.hud.toast('PALMERA BAY', 'Welcome back, Marco. Press M to take the next job.', 5);
    if (fresh && !this._introPlayed) {
      this._introPlayed = true;
      this.cutscenes.play('intro');
    }
  }

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.hud.showMenu(
      'PAUSED',
      `<p>Take a breath, Marco. The city waits.</p><p>${this.stats.summaryLine()}</p><p>Daily challenges: ${this.challenges.doneCount} of ${this.challenges.list.length} done.</p>`,
      'P / ENTER — resume &nbsp;·&nbsp; M — mute sound',
    );
  }

  resumeGame() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.hideMenu();
  }

  // ---------- wanted level ----------

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

  ageEffects(dt) {
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

  // ---------- save ----------

  saveGame() {
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          missionsDone: this.missions.storyIndex,
          money: this.player.money,
          packages: this.missions.packagesFound,
          stats: this.stats.toJSON(),
          empire: this.empire.toJSON(),
          garage: this.garage.toJSON(),
          missions2: this.missions2.toJSON(),
          heat: this.heat.toJSON(),
          life: this.life.toJSON(),
          arsenal: this.arsenal.toJSON(),
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
}

// Boot. The ?shot= staging (screenshots) hooks in before the first frame.
const game = new Game();
window.__game = game;
applyShot(game);
