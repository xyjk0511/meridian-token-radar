// Meridian Token Radar — Node 22 entrypoint (standard library only, deterministic).
// Reads /input/snapshot.json (or --input <path>), runs the shared empirical valuation &
// launch-odds engine from dashboard/engine.js, validates every gate invariant, writes
// /output/board.json, /output/data.js, copies dashboard/ and screenshots/, and builds
// /output/dossier.json via vendor/makefun-board.ts.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRadar, parseSnapshot, serializeDataScript, validateBoard } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const PLAIN_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function readFlag(name: string, fallback: string): string {
  const exact = `--${name}`;
  const idx = process.argv.indexOf(exact);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1]!;
  const prefix = `${exact}=`;
  const eq = process.argv.find((a) => a.startsWith(prefix));
  return eq === undefined ? fallback : eq.slice(prefix.length);
}

function copyDirectoryFiles(srcDir: string, dstDir: string): string[] {
  if (!existsSync(srcDir)) return [];
  mkdirSync(dstDir, { recursive: true });
  const names = readdirSync(srcDir).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const copied: string[] = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const srcPath = join(srcDir, name);
    if (!statSync(srcPath).isFile()) continue;
    if (!PLAIN_NAME.test(name)) {
      throw new Error(`refusing non-plain filename ${name} in ${srcDir}`);
    }
    copyFileSync(srcPath, join(dstDir, name));
    copied.push(name);
  }
  return copied;
}

function main(): void {
  const inputArg = readFlag('input', process.env.MAKEFUN_INPUT_DIR ?? '/input');
  const snapshotPath = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
  if (!existsSync(snapshotPath)) {
    process.stderr.write(`meridian-radar: snapshot not found at ${snapshotPath}\n`);
    process.exit(2);
  }

  const outDir = readFlag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = validateBoard(board, snapshot);
  if (issue !== null) {
    process.stderr.write(`meridian-radar: board validation failed: ${issue}\n`);
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`, 'utf8');
  writeFileSync(join(outDir, 'data.js'), serializeDataScript(radar), 'utf8');

  const dashFiles = copyDirectoryFiles(join(REPO_ROOT, 'dashboard'), join(outDir, 'dashboard'));
  const shots = copyDirectoryFiles(join(REPO_ROOT, 'screenshots'), join(outDir, 'screenshots'));

  const allowEmptyShots = process.argv.includes('--allow-no-screenshots');
  if (!allowEmptyShots && shots.length < 3) {
    process.stderr.write(`meridian-radar: screenshots/ has ${shots.length} image(s); gate requires 3 to 4\n`);
    process.exit(1);
  }

  if (shots.length > 0) {
    const dossierBytes = buildDossier(outDir, {
      text_max_bytes: TEXT_MAX_BYTES,
      screenshots: SCREENSHOT_CAPS,
      dashboard: DASHBOARD_CAPS,
    });
    writeFileSync(join(outDir, 'dossier.json'), dossierBytes);
    process.stdout.write(
      `meridian-radar: ${snapshot.protocols.length} protocols audited, ${board.length} pre-token ranked (${snapshot.watchlist.length} watchlist), ${dashFiles.length} dashboard files, ${shots.length} screenshots, dossier=${dossierBytes.length} bytes\n`,
    );
  } else {
    process.stdout.write(
      `meridian-radar: bootstrap build wrote board.json, data.js, and ${dashFiles.length} dashboard files (screenshots pending)\n`,
    );
  }
}

main();
