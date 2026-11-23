import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildRadar, parseSnapshot, validateBoard } from '../lib/model.ts';
import { buildDossier } from '../vendor/makefun-board.ts';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const SNAPSHOT_PATH = join(REPO, '..', 'token-radar-01-kit', 'input', 'snapshot.json');

test('parseSnapshot and buildRadar satisfy all gate invariants on sealed snapshot', () => {
  const snap = parseSnapshot(readFileSync(SNAPSHOT_PATH, 'utf8'));
  const { board, radar } = buildRadar(snap);
  assert.equal(validateBoard(board, snap), null);
  assert.ok(board.length >= 100 && board.length <= 4000, `board length ${board.length}`);

  // Watchlist 100% covered
  const slugSet = new Set(board.map((r) => r.slug));
  for (const w of snap.watchlist) {
    assert.ok(slugSet.has(w), `missing watchlist slug ${w}`);
  }

  // Strictly non-increasing implied_value_usd and non-constant
  for (let i = 1; i < board.length; i++) {
    assert.ok(board[i].implied_value_usd <= board[i - 1].implied_value_usd);
  }
  assert.ok(board[0].implied_value_usd > board[board.length - 1].implied_value_usd);

  // All 758 protocols accounted for
  const audit = radar.audit;
  const accounted =
    audit.watchlist +
    audit.expansion_above_floor +
    audit.early_below_floor +
    audit.excluded_pre_token +
    audit.live_comps_clean +
    audit.live_other +
    audit.cex_excluded;
  assert.equal(accounted, snap.protocols.length);

  // Blind validation beats starter linear baseline on both LOO and walk-forward
  assert.ok(radar.valuation.loo_factor < radar.valuation.starter_loo_factor);
  assert.ok(radar.valuation.walk_forward_factor < radar.valuation.starter_wf_factor);
  assert.ok(radar.odds_model.brier_skill_pct > 0);
});

test('dashboard/ source has zero network URLs and fits completely inside 65536-byte dossier text cap', () => {
  const dashDir = join(REPO, 'dashboard');
  const files = readdirSync(dashDir).filter((f) => !f.startsWith('.')).sort();
  assert.ok(files.includes('index.html'));
  assert.ok(files.some((f) => f.endsWith('.css')));
  assert.ok(files.some((f) => f.endsWith('.js')));

  let totalBytes = 0;
  for (const f of files) {
    const text = readFileSync(join(dashDir, f), 'utf8');
    totalBytes += Buffer.byteLength(text, 'utf8');
    assert.ok(!/https?:\/\//i.test(text), `network URL found in dashboard/${f}`);
  }
  assert.ok(totalBytes < 64000, `dashboard/ total bytes ${totalBytes} too close to 65536 cap`);
});

test('main.ts dual-run determinism and dossier byte-for-byte match when screenshots exist', () => {
  const shotsDir = join(REPO, 'screenshots');
  const shots = existsSync(shotsDir)
    ? readdirSync(shotsDir).filter((f) => !f.startsWith('.') && /\.(png|jpe?g)$/i.test(f))
    : [];
  if (shots.length < 3) return;

  const dir1 = mkdtempSync(join(tmpdir(), 'meridian-run1-'));
  const dir2 = mkdtempSync(join(tmpdir(), 'meridian-run2-'));
  try {
    execFileSync(process.execPath, [join(REPO, 'main.ts'), '--input', SNAPSHOT_PATH, '--output', dir1], { stdio: 'pipe' });
    execFileSync(process.execPath, [join(REPO, 'main.ts'), '--input', SNAPSHOT_PATH, '--output', dir2], { stdio: 'pipe' });

    for (const rel of ['board.json', 'data.js', 'dossier.json']) {
      const b1 = readFileSync(join(dir1, rel));
      const b2 = readFileSync(join(dir2, rel));
      assert.ok(b1.equals(b2), `${rel} differed between two runs`);
    }

    const dossier = readFileSync(join(dir1, 'dossier.json'));
    const rebuilt = buildDossier(dir1, {
      text_max_bytes: 65536,
      screenshots: { max: 4, max_bytes: 524288 },
      dashboard: { max_files: 400, max_bytes: 4194304 },
    });
    assert.ok(dossier.equals(Buffer.from(rebuilt)), 'dossier.json does not match buildDossier byte-for-byte');
    assert.ok(dossier.length <= 1_572_864, `dossier size ${dossier.length} exceeds 1.5 MiB`);

    const parsedDossier = JSON.parse(dossier.toString('utf8'));
    assert.ok(!parsedDossier.text.includes('[Cut at '), 'dashboard source was truncated in dossier!');
    assert.ok(parsedDossier.images.length >= 3 && parsedDossier.images.length <= 4);
  } finally {
    rmSync(dir1, { recursive: true, force: true });
    rmSync(dir2, { recursive: true, force: true });
  }
});
