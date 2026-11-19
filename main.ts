// Palmera Bay — the gta6-01 entry program (Node 22, standard library only).
//
// The game is this directory's game/ folder: plain static files a desktop
// browser loads offline (game/index.html and its ES modules, no library,
// no network request). This program hands it in: it copies game/ and
// screenshots/ from beside this file to /output and writes
// /output/dossier.json — the summary the judge reads — with the vendored
// make.fun library.
//
// The game itself is an original top-down open-world crime game: a seeded
// city to explore on foot and by car, traffic and pedestrians, cars to
// steal, a wanted level with police who chase (plus a helicopter and
// roadblocks at high heat), thirteen story missions, courier runs, combat,
// a HUD with a minimap and an objective tracker, synthesised sound and
// radio, and a save.
//
// Play it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Where the entry lives, and where the grader wants the hand-in.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Count the files and bytes under a directory, for the build log.
function countTree(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = countTree(path);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += statSync(path).size;
    }
  }
  return { files, bytes };
}

// Copy a directory tree when it exists; the screenshots folder is
// optional in a work-in-progress tree.
function copyTree(name) {
  const from = join(repoRoot, name);
  if (!existsSync(from)) return;
  cpSync(from, join(outputDir, name), { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
copyTree('game');
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
copyTree('screenshots');

// The scorer's caps, from the kit's reference/gate.json: at most 4
// screenshots of 256 KiB each; at most 993 files and 48 MiB under game/;
// no game/ path over 1000 bytes. Palmera Bay's build is deterministic —
// the city is seeded, so two runs of this program write byte-identical
// dossier.json files.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

// One line on stdout so the build's result is visible in the log.
const handedIn = countTree(outputDir);
console.log(`Palmera Bay handed in: ${dossier.length} bytes of dossier in ${outputDir}`);
console.log(`Hand-in contents: ${handedIn.files} files, ${handedIn.bytes} bytes under ${outputDir}`);
