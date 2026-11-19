// Screenshot staging: ?shot=<scene> puts the game into a fixed,
// photogenic state so the entry's screenshots are real renders of the
// game itself. The game keeps running — cars move, sirens blink.
// Scenes: cover (police chase), downtown (on foot), mission (bank job),
// beach (sunset drive along Coral Bay). v4 rewrote this file wholesale
// — same scenes, same framing — with one fix: the staged mission state
// now carries defeatBase, so a staged defeat step counts correctly.
import { AVENUES, STREETS } from './city.js';
import { Car } from './vehicles.js';
import { STORY } from './missions.js';

// Centre the camera on a world point.
function frameCamera(game, x, y) {
  game.renderer.cam.x = x - 640;
  game.renderer.cam.y = y - 400;
}

// Put Marco in a car at a spot, driving, and make it his car.
function giveCar(game, x, y, angle, modelIndex, speed) {
  const car = new Car(x, y, angle, modelIndex, { driver: null });
  car.speed = speed;
  game.traffic.cars.push(car);
  game.playerCar = car;
  game.player.inCar = true;
  game.player.x = x;
  game.player.y = y;
  return car;
}

// Jump the story to one mission at one step.
function setMission(game, storyIndex, step, holdT = 0) {
  game.missions.storyIndex = storyIndex;
  game.missions.active = { def: STORY[storyIndex], step, timer: 0, holdT, defeatBase: 0 };
}

const SCENES = {
  // A high-speed chase down a boulevard: 4 stars, the helicopter
  // overhead with its spotlight on Marco, the bank-job escape live.
  cover(game) {
    const x = AVENUES[5];
    const y = STREETS[2];
    giveCar(game, x, y - 40, Math.PI / 2, 0, 420);
    game.setWanted(4);
    game.crimeHeat = 4;
    for (let i = 0; i < 3; i++) {
      const police = game.traffic.spawnPolice(x + (i - 1) * 130, y - 300 - i * 60, Math.PI / 2);
      police.speed = 300;
    }
    game.police.forceHeli(x - 320, y - 180);
    game.police.watched = true;
    setMission(game, 4, 2);
    frameCamera(game, x, y - 40);
    game.hud.toast('BANK JOB', 'Escape! Lose the 4-star wanted level.', 30);
  },

  // On foot downtown, traffic and pedestrians all around, job one up.
  downtown(game) {
    const x = AVENUES[4];
    const y = STREETS[2];
    game.player.x = x + 10;
    game.player.y = y + 90;
    game.player.angle = -Math.PI / 2;
    game.traffic.spawn(8, x, y);
    game.crowd.spawn(14, x, y);
    game.missions.storyIndex = 0;
    game.missions.startStory();
    frameCamera(game, x, y);
  },

  // Mid bank robbery: inside the hold ring, pistol out, cops closing in.
  mission(game) {
    const bank = game.city.landmarks.bank;
    game.player.x = bank.x + 20;
    game.player.y = bank.y + 10;
    game.player.angle = Math.PI / 2;
    game.player.weapon = 'pistol';
    game.player.ammo = 48;
    game.setWanted(2);
    game.crimeHeat = 2;
    game.traffic.spawnPolice(bank.x - 200, bank.y - 260, Math.PI / 3);
    game.traffic.spawn(4, bank.x, bank.y);
    game.crowd.spawn(6, bank.x, bank.y);
    setMission(game, 4, 1, 3.5);
    frameCamera(game, bank.x, bank.y);
    game.hud.toast('BANK JOB', 'Hold up the bank — stay inside the marker 6 seconds.', 30);
  },

  // A sunset drive along the beachfront, sand and Coral Bay in frame.
  beach(game) {
    const x = AVENUES[4];
    const y = 2400;
    giveCar(game, x, y, 0, 7, 350);
    game.traffic.spawn(6, x, y);
    game.crowd.spawn(8, x, y);
    setMission(game, 1, 1);
    frameCamera(game, x, y);
    game.hud.toast('THE PICKUP', 'Drive Lucia to Club Flamingo.', 30);
  },

  // The street race at the stadium pad: Marco lined up beside three
  // rivals, the countdown about to run, the first checkpoint ahead.
  race(game) {
    const pad = game.races.pad;
    giveCar(game, pad.x, pad.y + 130, Math.PI / 2, 0, 0);
    game.races.state = 'armed';
    game.races.startRace(game);
    game.traffic.spawn(4, pad.x, pad.y);
    game.crowd.spawn(10, pad.x, pad.y);
    frameCamera(game, pad.x, pad.y + 60);
    game.hud.toast('STREET RACE', 'Three rivals, four checkpoints — first across the line takes $800.', 30);
  },
};

export function applyShot(game) {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (!shot || !SCENES[shot]) return;
  // Skip the start menu: the scene IS the game, already running.
  game.startGame(false);
  game.state = 'playing';
  game.hud.hideMenu();
  game.hud.showHud(true);
  SCENES[shot](game);
  window.__shot = shot;
}
