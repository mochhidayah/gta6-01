// Screenshot staging: ?shot=<scene> puts the game into a fixed,
// photogenic state so the entry's screenshots are real renders of the game.
// Scenes: cover (police chase), downtown (on foot), mission (bank job),
// beach (sunset drive). The game itself still runs — cars move, sirens blink.
import { AVENUES, STREETS, roadPointNear } from './city.js';
import { Car } from './vehicles.js';
import { STORY } from './missions.js';

const SCENES = {
  // High-speed chase down a boulevard, 4 stars, mission escape in progress.
  cover(game) {
    const x = AVENUES[5], y = STREETS[2];
    const car = new Car(x, y - 40, Math.PI / 2, 0, { driver: null });
    car.speed = 420;
    game.traffic.cars.push(car);
    game.playerCar = car;
    game.player.inCar = true;
    game.player.x = x; game.player.y = y - 40;
    game.setWanted(4);
    game.crimeHeat = 4;
    for (let i = 0; i < 3; i++) {
      const pc = game.traffic.spawnPolice(x + (i - 1) * 130, y - 300 - i * 60, Math.PI / 2);
      pc.speed = 300;
    }
    game.missions.storyIndex = 4;
    game.missions.active = { def: STORY[4], step: 2, timer: 0, holdT: 0 };
    game.renderer.cam.x = x - 640;
    game.renderer.cam.y = y - 40 - 400;
    game.hud.toast('BANK JOB', 'Escape! Lose the 4-star wanted level.', 30);
  },

  // On foot downtown, traffic and pedestrians around, first mission up.
  downtown(game) {
    const x = AVENUES[4], y = STREETS[2];
    game.player.x = x + 10; game.player.y = y + 90;
    game.player.angle = -Math.PI / 2;
    game.traffic.spawn(8, x, y);
    game.crowd.spawn(14, x, y);
    game.missions.storyIndex = 0;
    game.missions.startStory();
    game.renderer.cam.x = x - 640;
    game.renderer.cam.y = y - 400;
  },

  // Mid bank robbery: inside the hold ring, cops closing in.
  mission(game) {
    const bank = game.city.landmarks.bank;
    game.player.x = bank.x + 20; game.player.y = bank.y + 10;
    game.player.angle = Math.PI / 2;
    game.player.weapon = 'pistol';
    game.player.ammo = 48;
    game.setWanted(2);
    game.crimeHeat = 2;
    game.traffic.spawnPolice(bank.x - 200, bank.y - 260, Math.PI / 3);
    game.traffic.spawn(4, bank.x, bank.y);
    game.crowd.spawn(6, bank.x, bank.y);
    game.missions.storyIndex = 4;
    game.missions.active = { def: STORY[4], step: 1, timer: 0, holdT: 3.5 };
    game.renderer.cam.x = bank.x - 640;
    game.renderer.cam.y = bank.y - 400;
    game.hud.toast('BANK JOB', 'Hold up the bank — stay inside the marker 6 seconds.', 30);
  },

  // Sunset drive along the beachfront: sand and Coral Bay in frame.
  beach(game) {
    const x = AVENUES[4], y = 2400;
    const car = new Car(x, y, 0, 7, { driver: null });
    car.speed = 350;
    game.traffic.cars.push(car);
    game.playerCar = car;
    game.player.inCar = true;
    game.player.x = x; game.player.y = y;
    game.traffic.spawn(6, x, y);
    game.crowd.spawn(8, x, y);
    game.missions.storyIndex = 1;
    game.missions.active = { def: STORY[1], step: 1, timer: 0, holdT: 0 };
    game.renderer.cam.x = x - 640;
    game.renderer.cam.y = y - 400;
    game.hud.toast('THE PICKUP', 'Drive Lucia to Club Flamingo.', 30);
  },
};

export function applyShot(game) {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  if (!shot || !SCENES[shot]) return;
  // Skip the start menu: the scene is the game, running.
  game.startGame(false);
  game.state = 'playing';
  game.hud.hideMenu();
  game.hud.showHud(true);
  SCENES[shot](game);
  // Keep the staged state readable: no accidental mission auto-start.
  window.__shot = shot;
}
