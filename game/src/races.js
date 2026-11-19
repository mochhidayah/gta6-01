// Street races: illegal night racing out of Bay Sharks Stadium.
//
// A start pad sits by the stadium. Drive onto it with no job
// running and the race arms; press T to line up. Three rivals join,
// a 3-2-1 countdown runs, and the field races four checkpoints
// across the city — airfield, marina, docks, club. First across the
// line takes the crown and $800; the others split smaller prizes.
// Rivals drive the route themselves: they steer at the next
// checkpoint and lift off when a car is ahead, so they bunch up,
// overtake and occasionally bin it into a wall.
//
// The race is a side activity with teeth: it pays better than a
// taxi fare, but a crash at speed costs health, and the precinct
// notices a screaming pack of cars at 2am — winning a race adds
// a star of heat. v4 rewrote this file wholesale — same route, same
// prizes, new internal names.
import { clamp, wrapAngle, distSq, RACE } from './config.js';
import { pickWeighted } from './rng.js';

// Tuning lives in config.js (RACE): pad radius, checkpoint radius,
// countdown, rival count, prizes, rival pace, heat on finish.
const PAD_RADIUS = RACE.padRadius; // how close the pad has to be to arm the race
const CHECK_RADIUS = RACE.checkRadius; // how close a checkpoint has to be to count
const COUNTDOWN_SECONDS = RACE.countdown;
const RIVAL_COUNT = RACE.rivals;
const RIVAL_TOP = RACE.rivalTop; // rivals are quick, not unbeatable
const PRIZES = RACE.prizes; // 1st, 2nd, 3rd, 4th
// Rival cars, weighted: the fast Falcon shows up most, the Marina
// Sedan only when the field is feeling generous.
const RIVAL_MODELS = [
  { value: 'Falcon GT', weight: 3 },
  { value: 'Coral Coupe', weight: 2 },
  { value: 'Marina Sedan', weight: 1 },
];

// The route: start at the stadium, then four checkpoints across town.
function routeFor(landmarks) {
  return [
    { x: landmarks.airport.x, y: landmarks.airport.y, label: 'AIRFIELD' },
    { x: landmarks.marina.x, y: landmarks.marina.y, label: 'MARINA' },
    { x: landmarks.docks.x, y: landmarks.docks.y, label: 'DOCKS' },
    { x: landmarks.club.x, y: landmarks.club.y, label: 'CLUB FLAMINGO' },
  ];
}

export class StreetRace {
  constructor(game) {
    this.game = game;
    const stadium = game.city.landmarks.stadium;
    this.pad = { x: stadium.x + 150, y: stadium.y - 40 };
    this.route = routeFor(game.city.landmarks);
    this.state = 'idle'; // idle | armed | countdown | racing | done
    this.armedToasted = false;
    this.countdown = 0;
    this.lastBeep = 0;
    this.time = 0;
    this.next = 0; // the player's next checkpoint
    this.rivals = []; // {car, next, cruise, finished, place}
    this.finished = 0; // rivals who already finished
    this.won = false; // the player won the last race (missions read this)
    this.lastPlace = 0;
  }

  // Where the player's next checkpoint is, for the renderer and HUD.
  currentTarget() {
    if (this.state !== 'racing') return null;
    return this.route[this.next] || null;
  }

  get racing() {
    return this.state === 'countdown' || this.state === 'racing';
  }

  // During the countdown the cars are held on the grid.
  locked() {
    return this.state === 'countdown';
  }

  // The pad arms when the player rolls onto it in a car, job-free.
  update(dt, game) {
    if (this.state === 'idle') {
      const p = game.player;
      const ok = p.inCar && game.playerCar && !game.missions.active
        && !game.missions.taxi && !game.missions.courier && game.wanted === 0;
      if (!ok) {
        this.armedToasted = false;
        return;
      }
      const car = game.playerCar;
      if (distSq(car.x, car.y, this.pad.x, this.pad.y) < PAD_RADIUS * PAD_RADIUS) {
        this.state = 'armed';
        this.armedToasted = true;
        game.toast('STREET RACE', 'Illegal racing at the stadium — press T to line up, $800 to the winner.', 5);
        game.sounds.horn();
      }
      return;
    }
    if (this.state === 'armed') {
      const p = game.player;
      const car = game.playerCar;
      if (!p.inCar || !car || distSq(car.x, car.y, this.pad.x, this.pad.y) > (PAD_RADIUS + 120) * (PAD_RADIUS + 120)) {
        this.state = 'idle';
        this.armedToasted = false;
      }
      return;
    }
    if (this.state === 'countdown') {
      this.countdown -= dt;
      const whole = Math.ceil(this.countdown);
      if (whole !== this.lastBeep && whole > 0) {
        this.lastBeep = whole;
        game.sounds.countBeep();
        game.toast('RACE', `${whole}...`, 0.8);
      }
      if (this.countdown <= 0) {
        this.state = 'racing';
        game.sounds.countGo();
        game.toast('GO!', 'Four checkpoints — airfield, marina, docks, club. Win it.', 3);
      }
      return;
    }
    if (this.state === 'racing') this.updateRacing(dt, game);
  }

  // T at the pad: line the field up and run the countdown.
  startRace(game) {
    if (this.state !== 'armed') return false;
    const car = game.playerCar;
    this.rivals = [];
    for (let i = 0; i < RIVAL_COUNT; i++) {
      const angle = Math.PI / 2;
      const rx = this.pad.x - 60 + i * 46;
      const ry = this.pad.y + 60;
      const rival = game.traffic.spawnRacer(rx, ry, angle, pickWeighted(game.rng, RIVAL_MODELS));
      rival.speed = 0;
      this.rivals.push({ car: rival, next: 0, cruise: RIVAL_TOP[i], finished: false, place: 0 });
    }
    // The player lines up on the pad, nose to the first checkpoint.
    car.x = this.pad.x;
    car.y = this.pad.y + 130;
    car.angle = Math.PI / 2;
    car.speed = 0;
    this.next = 0;
    this.time = 0;
    this.finished = 0;
    this.won = false;
    this.state = 'countdown';
    this.countdown = COUNTDOWN_SECONDS;
    this.lastBeep = COUNTDOWN_SECONDS + 1;
    game.toast('LINE UP', 'Three rivals beside you. 3... 2... 1...', 3);
    return true;
  }

  updateRacing(dt, game) {
    this.time += dt;
    const car = game.playerCar;
    if (car && this.next < this.route.length) {
      const cp = this.route[this.next];
      if (distSq(car.x, car.y, cp.x, cp.y) < CHECK_RADIUS * CHECK_RADIUS) {
        this.next += 1;
        game.sounds.pickup();
        game.addParticles(cp.x, cp.y, 12, '#ffd23f');
        if (this.next >= this.route.length) this.finishRace(game, false);
        else game.toast('CHECKPOINT', `${this.next} of ${this.route.length} — next: ${this.route[this.next].label}.`, 2);
      }
    }
    for (const rival of this.rivals) this.driveRival(dt, rival, game);
    // A rival that finishes takes a place before the player can.
    for (const rival of this.rivals) {
      if (rival.finished || rival.next >= this.route.length) continue;
      const cp = this.route[rival.next];
      if (distSq(rival.car.x, rival.car.y, cp.x, cp.y) < CHECK_RADIUS * CHECK_RADIUS) {
        rival.next += 1;
        if (rival.next >= this.route.length) {
          rival.finished = true;
          this.finished += 1;
          rival.place = this.finished;
        }
      }
    }
  }

  // A rival steers at its next checkpoint and lifts when a car is
  // directly ahead, so the pack bunches and overtakes.
  driveRival(dt, rival, game) {
    const car = rival.car;
    if (car.dead || rival.finished) return;
    if (rival.next >= this.route.length) return;
    const cp = this.route[rival.next];
    const dx = cp.x - car.x;
    const dy = cp.y - car.y;
    const want = Math.atan2(dy, dx);
    const steer = clamp(wrapAngle(want - car.angle) * 1.8, -1, 1);
    let throttle = car.speed < rival.cruise ? 0.85 : 0;
    if (game.traffic.carAhead(car)) throttle = 0;
    car.drive(throttle, steer, false, dt);
  }

  // The player crossed the last checkpoint: place is one more than
  // the rivals who already finished. The precinct notices the noise.
  finishRace(game, byRival) {
    if (this.state !== 'racing') return;
    const place = this.finished + 1;
    this.lastPlace = place;
    this.state = 'done';
    this.won = place === 1;
    const prize = PRIZES[place - 1] || 50;
    game.player.money += prize;
    game.sounds.raceWin();
    game.addParticles(game.playerCar.x, game.playerCar.y, 20, '#ffd23f');
    if (place === 1) {
      game.toast('RACE WON', `First across the line — +$${prize}. The stadium crowd chants your name.`, 6);
    } else {
      game.toast('RACE OVER', `You came ${place}${place === 2 ? 'nd' : place === 3 ? 'rd' : 'th'} — +$${prize}. The crown goes to someone else tonight.`, 5);
    }
    game.police.addCrime(RACE.heatOnFinish, 'The race woke the whole precinct — a star of heat.', true);
    if (game.stats) game.stats.recordRace(place === 1);
    // Rivals cruise home: they stop being racers once the race ends.
    for (const rival of this.rivals) {
      if (!rival.car.dead) rival.car.driver = 'traffic';
    }
    this.rivals = [];
    setTimeout(() => {
      if (this.state === 'done') this.state = 'idle';
    }, 1000);
  }

  // The mission step for m11: true once a race has been won.
  get wonRace() {
    return this.won;
  }
}
