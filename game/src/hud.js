// HUD: health, money, wanted stars, objective line, speed, weapon,
// radio, in-game clock, toast banners and the menu screens
// (start / pause / busted / wasted / story complete).
const ELEMENT_IDS = [
  'hud', 'health-fill', 'health-num', 'money', 'stars', 'objective',
  'speed', 'weapon', 'radio', 'clock', 'toast', 'toast-title', 'toast-body',
  'menu', 'menu-title', 'menu-body', 'menu-hint', 'minimap', 'fps',
];

export class HUD {
  constructor() {
    this.el = {};
    for (const id of ELEMENT_IDS) this.el[id] = document.getElementById(id);
    this.toastTimer = 0;
  }

  showHud(on) {
    this.el.hud.style.display = on ? 'block' : 'none';
  }

  update(game, dt) {
    const p = game.player;
    const healthBar = this.el['health-fill'];
    healthBar.style.width = `${p.health}%`;
    healthBar.style.background = p.health > 50 ? '#58d068' : p.health > 25 ? '#f2c230' : '#e33f2f';
    this.el['health-num'].textContent = `${Math.ceil(p.health)} HP`;
    this.el.money.textContent = `$${p.money.toLocaleString('en-US')}`;
    this.el.stars.textContent = '★'.repeat(game.wanted) + '☆'.repeat(5 - game.wanted);
    this.el.stars.style.color = game.wanted > 0 ? '#ffd23f' : '#ffffff88';
    this.el.objective.textContent = this.objectiveText(game);
    this.el.speed.textContent =
      p.inCar && game.playerCar
        ? `${Math.round(Math.abs(game.playerCar.speed) * 0.22)} km/h`
        : p.sprint
          ? 'Sprinting'
          : 'On foot';
    this.el.weapon.textContent = p.inCar
      ? game.playerCar.model.name
      : p.weapon === 'pistol'
        ? `Pistol · ${p.ammo} rounds`
        : 'Fists';
    this.el.radio.textContent = game.sounds.radioOn
      ? `♪ ${game.sounds.radioNames[game.sounds.station]}`
      : '♪ Radio off';
    const totalMins = Math.floor(game.clock / 60);
    const hour = (17 + Math.floor(totalMins / 60)) % 24;
    const minute = String(totalMins % 60).padStart(2, '0');
    this.el.clock.textContent = `${String(hour).padStart(2, '0')}:${minute}`;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.remove('show');
    }
  }

  // The top-left objective line: mission step, taxi fare, or free roam.
  objectiveText(game) {
    const step = game.missions.currentStep();
    if (step) {
      let text = step.text;
      if (step.timer) {
        const left = Math.max(0, step.timer - game.missions.active.timer);
        text += `  —  ${Math.ceil(left)}s`;
      }
      if (step.type === 'rob' && game.missions.active.holdT > 0) {
        text += `  —  ${game.missions.active.holdT.toFixed(1)}s / ${step.hold}s`;
      }
      return text;
    }
    const taxi = game.missions.taxi;
    if (taxi) {
      return taxi.stage === 'pickup'
        ? 'Taxi: pick up the passenger at the marker.'
        : 'Taxi: drop the passenger at the marker.';
    }
    if (game.missions.storyDone) return 'Story complete — free roam: fares, stashes, chaos.';
    return 'No active mission — press M for the next job.';
  }

  toast(title, body, seconds = 4) {
    this.el['toast-title'].textContent = title;
    this.el['toast-body'].textContent = body;
    this.el.toast.classList.add('show');
    this.toastTimer = seconds;
  }

  showMenu(title, body, hint) {
    this.el['menu-title'].textContent = title;
    this.el['menu-body'].innerHTML = body;
    this.el['menu-hint'].textContent = hint;
    this.el.menu.style.display = 'flex';
  }

  hideMenu() {
    this.el.menu.style.display = 'none';
  }
}
