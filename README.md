[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/mochhidayah/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/mochhidayah/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

# Palmera Bay — an open-world crime story

An entry for the [make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01) ($1,666): a complete,
original open-world crime game that runs offline in a desktop browser from static files.

**Marco Solano** is back in Palmera Bay with $250 and a debt to pay. Six story jobs stand between
him and freedom — car theft, a pickup under a deadline, a police chase to outrun, a delivery, a bank
job, and one last armored-van score — plus taxi fares and hidden cash stashes in free roam.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network requests: `game/index.html` plus its modules under `game/src/`.

## What's in the city

- **Open world on foot and by car** — a seeded city of avenues, streets, blocks, a park, and a
  beachfront on Coral Bay, all drawn in canvas with no image assets.
- **Traffic and pedestrians** — cars follow the road grid, pedestrians stroll the sidewalks and
  flee from chaos; cars are there to be stolen (press **E**).
- **Wanted level and police** — crimes raise 0–5 stars; police cars chase and ram, on-foot cops
  try to bust you. Lose the heat to clear it; getting busted or wasted costs you money.
- **Missions and story** — six jobs with markers, timers, hold-ups and escapes, with paydays.
- **Combat** — fists and a pistol (mouse aim, click to shoot), car damage, smoke and explosions.
- **HUD with minimap** — health, money, wanted stars, mission objective, speed, weapon, radio
  station, in-game clock, and a live minimap with mission and police blips.
- **Sound and music** — everything synthesised live with WebAudio: engine, sirens, gunshots,
  and three radio stations (Sunset FM, Radio Palma, Night Drive). Press **R** to change station.
- **Save** — progress (missions done, money) persists in localStorage; continue from the menu.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| E | Steal & enter car / exit car |
| Mouse + click | Aim / shoot pistol |
| Space | Punch (on foot) / handbrake (driving) |
| Shift | Sprint |
| M | Next mission |
| R | Change radio station |
| 1 / 2 | Fists / pistol |
| P | Pause |

## Layout

- `game/` — the game itself: `index.html` and `src/` (one job per file: city, vehicles,
  people, missions, render, hud, input, audio, shots).
- `main.ts` — the entry program: copies `game/` and `screenshots/` to `/output` and writes
  `dossier.json` with the vendored make.fun library.
- `screenshots/` — four real renders of the game running in a browser.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.

Everything in this game — the city, characters, vehicles, names, story, art and sounds — is
original. Nothing is taken from Rockstar Games' Grand Theft Auto series or any other commercial game.

## License

MIT — see [LICENSE](LICENSE).
