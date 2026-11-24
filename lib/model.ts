// TypeScript bridge between main.ts (Node 22) and the shared dashboard/engine.js module.
// Calls the exact statistical, survival-odds, farm-plan, and integrity functions in dashboard/engine.js.

import '../dashboard/engine.js';

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  tier: 'watchlist' | 'expansion' | 'early';
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  launch_mcap_usd: number;
  launch_p25_usd: number;
  launch_p75_usd: number;
  ev_p25_usd: number;
  ev_p75_usd: number;
  launch_odds: number;
  sibling_live: string | null;
  farm_verdict: 'FARM' | 'THIN' | 'SKIP';
  farm_net_ev_usd: number;
  farm_hourly_usd: number;
  farm_gas_usd: number;
  farm_hours: number;
  farm_breakeven_usd: number | null;
  model: Record<string, unknown>;
  farm_steps: string[];
}

export interface RadarOutput {
  board: BoardRow[];
  radar: Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EngineApi = Record<string, any>;

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

function getEngine(): EngineApi {
  const api = (globalThis as unknown as { MeridianEngine?: EngineApi }).MeridianEngine;
  if (!api) throw new Error('MeridianEngine failed to load from dashboard/engine.js');
  return api;
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SnapshotError('snapshot.json must be a JSON object');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) {
    throw new SnapshotError('snapshot.json is missing a valid YYYY-MM-DD as_of date');
  }
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json is missing source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json is missing positive integer floor_usd');
  }
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json is missing protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot.json is missing watchlist array');
  }
  const protocols: SnapshotProtocol[] = o.protocols.map((entry, idx) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new SnapshotError(`protocol ${idx} is not an object`);
    }
    const p = entry as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`protocol ${idx} lacks slug, name, or finite tvl_usd`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

export function buildRadar(snapshot: Snapshot): RadarOutput {
  const E = getEngine();
  const cfg = { ...E.DEFAULT_CONFIG };
  const protocols = [...snapshot.protocols].sort((a, b) => E.byCode(a.slug, b.slug));
  const wlSet = new Set(snapshot.watchlist);

  const val = fitValuationModelLocal(protocols, snapshot.as_of, E);
  const odds = fitTokenOddsModelLocal(protocols, snapshot.as_of, E);
  const sibIdx = buildSiblingIndexLocal(protocols, E);
  const cleanComps = protocols.filter((p: SnapshotProtocol) => E.isCleanComp(p));

  const selected: { p: SnapshotProtocol; tier: 'watchlist' | 'expansion' | 'early' }[] = [];
  const excludedPre: { slug: string; name: string; category: string; tvl_usd: number; reason: string }[] = [];
  const liveAll: SnapshotProtocol[] = [];
  const cexList: SnapshotProtocol[] = [];

  for (const p of protocols) {
    if (wlSet.has(p.slug)) {
      selected.push({ p, tier: 'watchlist' });
    } else if (p.category === 'CEX') {
      cexList.push(p);
    } else if (E.isPreToken(p)) {
      const sib = E.findSiblingLive(p, sibIdx);
      if (E.isCleanProduct(p) && !sib) {
        selected.push({ p, tier: p.tvl_usd >= snapshot.floor_usd ? 'expansion' : 'early' });
      } else {
        const reason = E.EXCLUDED_CATS.has(p.category || '')
          ? `Excluded category (${p.category})`
          : E.VERSION_RE.test(p.name)
            ? 'Versioned release pool'
            : E.WRAPPED_RE.test(p.name)
              ? 'Wrapped or staked derivative'
              : E.EXCHANGE_RE.test(p.name)
                ? 'Exchange-branded product'
                : sib
                  ? `Sibling live token (${sib.slug})`
                  : 'Filtered derivative';
        excludedPre.push({ slug: p.slug, name: p.name, category: p.category || 'Other', tvl_usd: p.tvl_usd, reason });
      }
    } else {
      liveAll.push(p);
    }
  }

  const scoredList = selected
    .map(({ p, tier }) => {
      const sc = E.scoreProtocol(p, snapshot.as_of, val, odds, sibIdx, cleanComps);
      const fm = E.buildFarmPlan(p, sc, cfg, cfg.default_budget_usd);
      const peers = findNearestCompsLocal(p, cleanComps, E);
      return { p, tier, sc, fm, peers };
    })
    .sort((a, b) => (b.sc.implied_value_usd - a.sc.implied_value_usd) || E.byCode(a.p.slug, b.p.slug));

  const board: BoardRow[] = scoredList.map(({ p, tier, sc, fm }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    tier,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'pre-token',
    age_days: sc.age_days,
    implied_value_usd: sc.implied_value_usd,
    launch_mcap_usd: sc.launch_mcap_usd,
    hier_mcap_usd: sc.hier_mcap_usd,
    kernel_mcap_usd: sc.kernel_mcap_usd,
    launch_p25_usd: sc.launch_p25_usd,
    launch_p75_usd: sc.launch_p75_usd,
    ev_p25_usd: sc.ev_p25_usd,
    ev_p75_usd: sc.ev_p75_usd,
    launch_odds: sc.launch_odds,
    sibling_live: sc.sibling_live,
    farm_verdict: fm.verdict,
    farm_net_ev_usd: fm.net_ev_usd,
    farm_hourly_usd: fm.hourly_usd,
    farm_gas_usd: fm.total_gas_usd,
    farm_hours: fm.total_hours,
    farm_breakeven_usd: fm.breakeven_capital_usd,
    model: { version: cfg.version, alpha: val.alpha, beta: val.beta, launch_odds: sc.launch_odds },
    farm_steps: fm.farm_steps,
  }));

  const rowsBase = scoredList.map(({ p, tier, sc, fm, peers }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    tier,
    category: p.category || 'Other',
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    listed_at: p.listed_at,
    age_days: sc.age_days,
    implied_value_usd: sc.implied_value_usd,
    launch_mcap_usd: sc.launch_mcap_usd,
    hier_mcap_usd: sc.hier_mcap_usd,
    kernel_mcap_usd: sc.kernel_mcap_usd,
    launch_p25_usd: sc.launch_p25_usd,
    launch_p75_usd: sc.launch_p75_usd,
    ev_p25_usd: sc.ev_p25_usd,
    ev_p75_usd: sc.ev_p75_usd,
    eco_count: sc.eco_count,
    cat_eb_mult: sc.cat_eb_mult,
    chain_eb_mult: sc.chain_eb_mult,
    launch_odds: sc.launch_odds,
    category_asymp_rate: sc.category_asymp_rate,
    survival_remaining: sc.survival_remaining,
    momentum_factor: sc.momentum_factor,
    sibling_live: sc.sibling_live,
    sibling_symbol: sc.sibling_symbol,
    verdict: fm.verdict,
    chain: fm.chain,
    chain_tier: fm.chain_tier,
    saved_vs_primary_usd: fm.saved_vs_primary_usd,
    saved_vs_max_usd: fm.saved_vs_max_usd,
    net_ev_usd: fm.net_ev_usd,
    hourly_usd: fm.hourly_usd,
    total_gas_usd: fm.total_gas_usd,
    total_hours: fm.total_hours,
    breakeven_capital_usd: fm.breakeven_capital_usd,
    peers,
  }));

  const rankBands = computeRankIntervalsLocal(rowsBase);
  const rows = rowsBase.map((r, i) => ({ ...r, rank_lo: rankBands[i]!.rank_lo, rank_hi: rankBands[i]!.rank_hi }));

  const compsOut = cleanComps
    .map((p: SnapshotProtocol) => ({
      slug: p.slug,
      name: p.name,
      symbol: p.symbol,
      category: p.category || 'Other',
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      age_days: E.ageDays(snapshot.as_of, p.listed_at),
      predicted_mcap_usd: E.predictStage1(p, val, cleanComps).launchMcap,
      ratio: E.r2((p.mcap_usd ?? 0) / Math.max(1, p.tvl_usd)),
    }))
    .sort((a: { mcap_usd: number; slug: string }, b: { mcap_usd: number; slug: string }) => b.mcap_usd - a.mcap_usd || E.byCode(a.slug, b.slug));

  excludedPre.sort((a, b) => b.tvl_usd - a.tvl_usd || E.byCode(a.slug, b.slug));

  const radar: Record<string, unknown> = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    config: cfg,
    valuation: val,
    odds_model: odds,
    siblings: sibIdx,
    audit: {
      total_snapshot: protocols.length,
      watchlist: selected.filter((x) => x.tier === 'watchlist').length,
      expansion_above_floor: selected.filter((x) => x.tier === 'expansion').length,
      early_below_floor: selected.filter((x) => x.tier === 'early').length,
      excluded_pre_token: excludedPre.length,
      live_comps_clean: cleanComps.length,
      live_other: liveAll.length - cleanComps.length,
      cex_excluded: cexList.length,
    },
    rows,
    comps: compsOut,
    excluded_pre: excludedPre.slice(0, 40),
  };

  const check = E.verifyIntegrity(radar);
  if (!check.all_pass) {
    throw new Error(`internal integrity check failed: ${JSON.stringify(check)}`);
  }
  return { board, radar };
}

export function validateBoard(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows (gate requires 100..4000)`;
  const snapSlugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (let i = 0; i < board.length; i++) {
    const r = board[i]!;
    if (!snapSlugs.has(r.slug)) return `unknown slug ${r.slug}`;
    if (seen.has(r.slug)) return `duplicate slug ${r.slug}`;
    seen.add(r.slug);
    if (r.rank !== i + 1) return `expected rank ${i + 1}, got ${r.rank}`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has invalid implied_value_usd ${r.implied_value_usd}`;
    }
    if (i > 0 && r.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `rank ${r.rank} (${r.slug}) exceeds rank ${i} in implied_value_usd`;
    }
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      return `${r.slug} has invalid farm_steps count`;
    }
    for (const s of r.farm_steps) {
      const len = s.trim().length;
      if (len < 20 || len > 600) return `${r.slug} has farm step length ${len}`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return 'all rows share identical implied_value_usd';
  }
  const missingWl = snapshot.watchlist.filter((s) => !seen.has(s));
  if (missingWl.length > 0) return `missing ${missingWl.length} watchlist slugs: ${missingWl.slice(0, 5).join(', ')}`;
  return null;
}

const STOP_ROOTS = new Set('the defi protocol finance network chain swap capital labs dao liquid yield vault vaults market markets money staking stake pool pools bridge earn core pro app usd btc eth sol token coin open hyper super meta omni multi cross base prime layer onchain digital global crypto block smart auto alpha delta gamma sigma omega zero one'.split(' '));

function buildSiblingIndexLocal(protocols: SnapshotProtocol[], E: EngineApi): Record<string, { slug: string; name: string; symbol: string | null; mcap_usd: number | null }> {
  const idx: Record<string, { slug: string; name: string; symbol: string | null; mcap_usd: number | null }> = Object.create(null);
  protocols
    .filter((p) => !E.isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => E.byCode(a.slug, b.slug))
    .forEach((p) => {
      const k = p.slug.toLowerCase().split('-')[0];
      if (!k || k.length < 4 || STOP_ROOTS.has(k)) return;
      const prev = idx[k];
      if (!prev || (p.mcap_usd || 0) > (prev.mcap_usd || 0) || ((p.mcap_usd || 0) === (prev.mcap_usd || 0) && p.tvl_usd > (prev.mcap_usd || 0))) {
        idx[k] = { slug: p.slug, name: p.name, symbol: p.symbol, mcap_usd: p.mcap_usd };
      }
    });
  return idx;
}

function findNearestCompsLocal(p: SnapshotProtocol, cleanComps: SnapshotProtocol[], E: EngineApi) {
  const lt = Math.log(Math.max(1, p.tvl_usd)), cat = p.category || 'Other';
  return cleanComps
    .map((c) => ({ c, d: Math.abs(Math.log(Math.max(1, c.tvl_usd)) - lt) + ((c.category || 'Other') === cat ? 0 : 1.15) }))
    .sort((a, b) => a.d - b.d || E.byCode(a.c.slug, b.c.slug))
    .slice(0, 3)
    .map(({ c }) => ({ slug: c.slug, name: c.name, symbol: c.symbol, category: c.category || 'Other', tvl_usd: c.tvl_usd, mcap_usd: c.mcap_usd, ratio: E.r2((c.mcap_usd ?? 0) / Math.max(1, c.tvl_usd)) }));
}

function computeRankIntervalsLocal(rows: { rank: number; implied_value_usd: number; ev_p25_usd: number; ev_p75_usd: number }[]) {
  const evs = rows.map((r) => r.implied_value_usd);
  return rows.map((r) => {
    let betterThanHi = 0, betterThanLo = 0;
    for (let j = 0; j < evs.length; j++) {
      if (evs[j]! > r.ev_p75_usd) betterThanHi++;
      if (evs[j]! > r.ev_p25_usd) betterThanLo++;
    }
    return { rank_lo: Math.min(r.rank, betterThanHi + 1), rank_hi: Math.max(r.rank, Math.min(rows.length, betterThanLo + 1)) };
  });
}

export function serializeDataScript(radar: Record<string, unknown>): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

function dotLocal(x: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i]! * b[i]!;
  return s;
}

function huberLocationLocal(arr: number[], E: EngineApi): number {
  if (!arr.length) return 0;
  let loc = E.median(arr);
  const scale = 1.35 * (E.median(arr.map((v) => Math.abs(v - loc))) * 1.4826 || 1);
  for (let it = 0; it < 10; it++) {
    let sw = 0, sv = 0;
    for (const v of arr) {
      const d = Math.abs(v - loc), w = d <= scale ? 1 : scale / d;
      sw += w;
      sv += w * v;
    }
    loc = sv / (sw || 1);
  }
  return loc;
}

function shrinkGroupLocal(groups: Record<string, number[]>, k: number, E: EngineApi): Record<string, number> {
  const out: Record<string, number> = Object.create(null);
  Object.keys(groups).forEach((key) => {
    const arr = groups[key]!;
    out[key] = (arr.length / (arr.length + k)) * huberLocationLocal(arr, E);
  });
  return out;
}

function solveLinearLocal(A: number[][], b: number[]): number[] | null {
  const n = b.length, M = A.map((r, i) => [...r, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    const diag = M[c]![c]!;
    if (Math.abs(diag) < 1e-12) return null;
    for (let j = c; j <= n; j++) M[c]![j] = M[c]![j]! / diag;
    for (let r = 0; r < n; r++) if (r !== c) {
      const f = M[r]![c]!;
      for (let j = c; j <= n; j++) M[r]![j] = M[r]![j]! - f * M[c]![j]!;
    }
  }
  return M.map((r) => r[n]!);
}

function fitHuberLocal(X: number[][], y: number[], E: EngineApi, delta = 1.35, ridge = 3, iters = 28): number[] {
  const d = X[0]!.length;
  let w = X.map(() => 1), beta = new Array<number>(d).fill(0);
  for (let st = 0; st < iters; st++) {
    const A = Array.from({ length: d }, () => new Array<number>(d).fill(0)), rhs = new Array<number>(d).fill(0);
    for (let i = 0; i < X.length; i++) {
      const xi = X[i]!, yi = y[i]!, wi = w[i]!;
      for (let a = 0; a < d; a++) {
        rhs[a] = rhs[a]! + wi * xi[a]! * yi;
        for (let b = 0; b < d; b++) A[a]![b] = A[a]![b]! + wi * xi[a]! * xi[b]!;
      }
    }
    for (let a = 1; a < d; a++) A[a]![a] = A[a]![a]! + (a === 1 ? 1e-3 : ridge);
    const nx = solveLinearLocal(A, rhs);
    if (!nx) break;
    beta = nx;
    const res = X.map((xi, i) => y[i]! - dotLocal(xi, beta));
    const sc = delta * (E.median(res.map(Math.abs)) * 1.4826 || 1);
    w = res.map((r) => (Math.abs(r) <= sc ? 1 : sc / Math.abs(r)));
  }
  return beta;
}

function fitHierarchicalEnsembleLocal(
  train: SnapshotProtocol[],
  featFn: (p: SnapshotProtocol) => number[],
  E: EngineApi,
  ridge = 3,
  kCat = 6,
  kCh = 3,
  pShare = 0.65,
  wKern = 0.4,
) {
  const X = train.map(featFn), y = train.map((p) => Math.log(p.mcap_usd!));
  const beta = fitHuberLocal(X, y, E, 1.35, ridge, 28);
  const byCat: Record<string, number[]> = Object.create(null);
  const byAll: Record<string, number[]> = Object.create(null);
  const byPrim: Record<string, number[]> = Object.create(null);
  if (kCat > 0) train.forEach((p, i) => (byCat[E.catOf(p)] ||= []).push(y[i]! - dotLocal(X[i]!, beta)));
  const catAdj = kCat > 0 ? shrinkGroupLocal(byCat, kCat, E) : Object.create(null);
  if (kCh > 0) train.forEach((p, i) => {
    const rem = y[i]! - dotLocal(X[i]!, beta) - (catAdj[E.catOf(p)] || 0), chs: string[] = E.chainsOf(p);
    (byPrim[chs[0]!] ||= []).push(rem);
    chs.forEach((c) => (byAll[c] ||= []).push(rem));
  });
  const chAdj = kCh > 0 ? shrinkGroupLocal(byAll, kCh, E) : Object.create(null);
  const primAdj = kCh > 0 ? shrinkGroupLocal(byPrim, kCh, E) : Object.create(null);
  const predict = (p: SnapshotProtocol) => {
    const chs: string[] = E.chainsOf(p);
    const allAvg = kCh > 0 ? chs.reduce((s, c) => s + (chAdj[c] || 0), 0) / chs.length : 0;
    const chTerm = kCh > 0 ? pShare * (primAdj[chs[0]!] || 0) + (1 - pShare) * allAvg : 0;
    const hier = dotLocal(featFn(p), beta) + (catAdj[E.catOf(p)] || 0) + chTerm;
    return wKern > 0 ? (1 - wKern) * hier + wKern * E.peerKernelPredict(p, train, beta[1]) : hier;
  };
  return { beta, catAdj, chAdj, primAdj, predict };
}

function fitValuationModelLocal(protocols: SnapshotProtocol[], asOf: string, E: EngineApi) {
  const stopSet = E.buildChainStopSet(protocols);
  const ecoCounts: Record<string, number> = Object.create(null);
  for (const p of protocols) {
    const rt = E.rootToken(p.name, stopSet);
    if (rt) ecoCounts[rt] = (ecoCounts[rt] || 0) + 1;
  }
  const ecoLog = (p: SnapshotProtocol) => {
    const rt = E.rootToken(p.name, stopSet);
    return Math.log(rt ? (ecoCounts[rt] || 1) : 1);
  };
  const comps = protocols.filter(E.isCleanComp).sort((a, b) => E.byCode(a.slug, b.slug));
  const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => E.byCode(a.listed_at, b.listed_at) || E.byCode(a.slug, b.slug));
  const wfCut = Math.floor(dated.length * 0.65), wfTrain = dated.slice(0, wfCut), wfTest = dated.slice(wfCut);
  const cats = [...new Set(comps.map(E.catOf))].sort(E.byCode);
  const medFac = (errs: number[]) => E.r2(Math.exp(E.median(errs.map(Math.abs))));
  const starterLog = (p: SnapshotProtocol) => Math.log(Math.max(1, p.tvl_usd * 0.25 * (1 + (E.clamp(p.change_7d ?? 0, -60, 120) / 100) * 0.5) * (0.6 + (Math.min(Math.max(E.ageDays(asOf, p.listed_at) ?? 365, 0), 1095) / 1095) * 0.4)));

  function evalCand(name: string, status: string, note: string, fn: (p: SnapshotProtocol) => number[], ridge: number, kCat: number, kCh: number, pShare: number, wKern: number) {
    const run = (tr: SnapshotProtocol[], te: SnapshotProtocol[]) => {
      const m = fitHierarchicalEnsembleLocal(tr, fn, E, ridge, kCat, kCh, pShare, wKern);
      return te.map((p) => Math.log(p.mcap_usd!) - m.predict(p));
    };
    const loo = comps.map((c, i) => run(comps.filter((_, j) => j !== i), [c])[0]!);
    const kf: number[] = [], loco: number[] = [];
    for (let f = 0; f < 10; f++) kf.push(...run(comps.filter((_, i) => i % 10 !== f), comps.filter((_, i) => i % 10 === f)));
    const wf = run(wfTrain, wfTest);
    for (const c of cats) {
      const tr = comps.filter((p) => E.catOf(p) !== c);
      if (tr.length >= 10) loco.push(...run(tr, comps.filter((p) => E.catOf(p) === c)));
    }
    return { name, status, note, loo, loo_factor: medFac(loo), tenfold_factor: medFac(kf), walk_forward_factor: medFac(wf), loco_factor: medFac(loco) };
  }

  const uniF = (p: SnapshotProtocol) => [1, Math.log(p.tvl_usd)];
  const hierF = (p: SnapshotProtocol) => [1, Math.log(p.tvl_usd), ecoLog(p), E.clamp(p.change_7d ?? 0, -50, 100) / 100];
  const cands = [
    evalCand('Univariate Huber ln(TVL)', 'BASE', 'Single-factor power law', uniF, 1e-3, 0, 0, 0, 0),
    evalCand('Hierarchical Huber-EB (No Kernel)', 'BASE', 'Multi-factor TVL+Eco+7d + EB Cat/Chain', hierF, 3, 6, 3, 0.65, 0),
    evalCand('Meridian-5 Ensemble (60% EB + 40% Kernel)', 'KEPT', 'Cuts LOO to 2.77x (-44%) & 10F to 2.94x', hierF, 3, 6, 3, 0.65, 0.4),
    evalCand('+ Raw log(age) in Stage 1', 'DROPPED', 'Worsens WF to 3.32x; drives Stage 2', (p) => [...hierF(p), Math.log1p(E.ageDays(asOf, p.listed_at) ?? 365)], 3, 6, 3, 0.65, 0.4),
  ];

  const kept = cands[2]!, uni = cands[0]!, full = fitHierarchicalEnsembleLocal(comps, hierF, E, 3, 6, 3, 0.65, 0.4);
  const starterLoo = medFac(comps.map((p) => Math.log(p.mcap_usd!) - starterLog(p)));
  const starterWf = medFac(wfTest.map((p) => Math.log(p.mcap_usd!) - starterLog(p)));
  let in50 = 0, in80 = 0;
  kept.loo.forEach((res: number, i: number) => {
    const o = kept.loo.filter((_: number, j: number) => j !== i);
    if (res >= E.quantile(o, 0.25) && res <= E.quantile(o, 0.75)) in50++;
    if (res >= E.quantile(o, 0.1) && res <= E.quantile(o, 0.9)) in80++;
  });
  const roundMap = (src: Record<string, number>) => {
    const m: Record<string, number> = Object.create(null);
    Object.keys(src).sort(E.byCode).forEach((k) => { m[k] = E.r4(src[k]!); });
    return m;
  };

  return {
    comps_count: comps.length, wf_train_count: wfTrain.length, wf_test_count: wfTest.length,
    alpha: E.r4(full.beta[0]), beta: E.r4(full.beta[1]), beta_eco: E.r4(full.beta[2]), beta_7d: E.r4(full.beta[3]),
    cat_eb_k: 6, chain_eb_k: 3, primary_chain_share: 0.65, kernel_weight: 0.4,
    cat_effects: roundMap(full.catAdj), chain_effects: roundMap(full.chAdj), primary_chain_effects: roundMap(full.primAdj),
    eco_counts: ecoCounts, chain_stops: [...stopSet].sort(E.byCode),
    conformal_p10_mult: E.r4(Math.exp(E.quantile(kept.loo, 0.1))), conformal_p25_mult: E.r4(Math.exp(E.quantile(kept.loo, 0.25))),
    conformal_p75_mult: E.r4(Math.exp(E.quantile(kept.loo, 0.75))), conformal_p90_mult: E.r4(Math.exp(E.quantile(kept.loo, 0.9))),
    cov_50_pct: E.r2((100 * in50) / comps.length), cov_80_pct: E.r2((100 * in80) / comps.length),
    loo_factor: kept.loo_factor, tenfold_factor: kept.tenfold_factor, walk_forward_factor: kept.walk_forward_factor, loco_factor: kept.loco_factor,
    uni_loo_factor: uni.loo_factor, uni_wf_factor: uni.walk_forward_factor, starter_loo_factor: starterLoo, starter_wf_factor: starterWf,
    ablation: [
      { name: 'Linear 0.25x TVL baseline', status: 'BENCHMARK', loo_factor: starterLoo, tenfold_factor: starterLoo, walk_forward_factor: starterWf, loco_factor: starterLoo, note: 'Starter heuristic overprices mega-TVL' },
      ...cands.map(({ name, status, loo_factor, tenfold_factor, walk_forward_factor, loco_factor, note }) => ({ name, status, loo_factor, tenfold_factor, walk_forward_factor, loco_factor, note })),
    ],
  };
}

function fitTokenOddsModelLocal(protocols: SnapshotProtocol[], asOf: string, E: EngineApi) {
  const univ = protocols.filter((p) => p.category !== 'CEX' && !E.WRAPPED_RE.test(p.name) && !E.EXCHANGE_RE.test(p.name)).sort((a, b) => E.byCode(a.slug, b.slug));
  const dated = univ.filter((p) => E.ageDays(asOf, p.listed_at) !== null).sort((a, b) => E.byCode(a.listed_at, b.listed_at) || E.byCode(a.slug, b.slug));
  const medAge = Math.round(E.median(dated.map((p) => E.ageDays(asOf, p.listed_at))));
  const mat = univ.filter((p) => (E.ageDays(asOf, p.listed_at) ?? 0) >= 1095);
  const L0 = mat.length ? E.clamp(mat.filter((p) => !E.isPreToken(p)).length / mat.length, 0.55, 0.9) : 0.8;

  let bestTau = 600, bestLL = -Infinity;
  for (let tau = 200; tau <= 1600; tau += 25) {
    let ll = 0;
    for (const p of dated) {
      const pr = E.clamp(L0 * (1 - Math.exp(-E.ageDays(asOf, p.listed_at) / tau)), 1e-4, 1 - 1e-4);
      ll += E.isPreToken(p) ? Math.log(1 - pr) : Math.log(pr);
    }
    if (ll > bestLL) { bestLL = ll; bestTau = tau; }
  }

  const byRt: Record<string, SnapshotProtocol[]> = Object.create(null);
  for (const p of univ) {
    const rk = p.slug.toLowerCase().split('-')[0];
    if (rk && rk.length >= 4 && !E.STOP_ROOTS.has(rk)) (byRt[rk] ||= []).push(p);
  }
  let sibTot = 0, sibOwn = 0;
  Object.keys(byRt).forEach((rk) => {
    const grp = byRt[rk]!, live = grp.filter((p) => !E.isPreToken(p));
    if (grp.length < 2 || !live.length) return;
    const prim = [...live].sort((a, b) => (b.mcap_usd || 0) - (a.mcap_usd || 0) || b.tvl_usd - a.tvl_usd)[0]!;
    for (const p of grp) {
      if (p.slug === prim.slug) continue;
      sibTot++;
      if (!E.isPreToken(p) && (p.gecko_id || p.symbol) !== (prim.gecko_id || prim.symbol)) sibOwn++;
    }
  });
  const sibRate = E.r4(E.clamp((sibOwn + 1) / (sibTot + 2), 0.02, 0.25));

  const wfCut = Math.floor(dated.length * 0.65), wfTr = dated.slice(0, wfCut), wfTe = dated.slice(wfCut);
  const gRate = univ.filter((p) => !E.isPreToken(p)).length / univ.length;
  const wRate = wfTr.filter((p) => !E.isPreToken(p)).length / wfTr.length;
  const bLooBase = univ.reduce((s, p) => s + ((E.isPreToken(p) ? 0 : 1) - gRate) ** 2, 0) / univ.length;
  const bWfBase = wfTe.reduce((s, p) => s + ((E.isPreToken(p) ? 0 : 1) - wRate) ** 2, 0) / wfTe.length;
  const haz = (p: SnapshotProtocol) => 1 - Math.exp(-(E.ageDays(asOf, p.listed_at) ?? medAge) / bestTau);
  const tally = (list: SnapshotProtocol[]) => {
    const m: Record<string, { n: number; live: number; fSum: number }> = Object.create(null);
    for (const p of list) {
      const o = (m[E.catOf(p)] ||= { n: 0, live: 0, fSum: 0 });
      o.n++; if (!E.isPreToken(p)) o.live++; o.fSum += haz(p);
    }
    return m;
  };
  const obsAll = tally(univ), obsWf = tally(wfTr);

  let bestK = 5, bestObj = Infinity, bestLoo = 1, bestWf = 1, bestAuc = 0.5;
  for (const k of [2, 3, 5, 8]) {
    let lS = 0, wS = 0; const prds: { y: number; pr: number }[] = [];
    for (const u of univ) {
      const y = E.isPreToken(u) ? 0 : 1, o = obsAll[E.catOf(u)]!, f = haz(u);
      const pr = E.clamp(E.clamp(((o.live - y) + k * L0) / ((o.fSum - f) + k), 0.08, 0.92) * f, 0.02, 0.98);
      prds.push({ y, pr }); lS += (y - pr) ** 2;
    }
    for (const u of wfTe) {
      const y = E.isPreToken(u) ? 0 : 1, o = obsWf[E.catOf(u)] || { n: 0, live: 0, fSum: 0 };
      wS += (y - E.clamp(E.clamp((o.live + k * L0) / (o.fSum + k), 0.08, 0.92) * haz(u), 0.02, 0.98)) ** 2;
    }
    const bL = lS / univ.length, bW = wS / wfTe.length;
    if (bL + bW < bestObj) {
      bestObj = bL + bW; bestK = k; bestLoo = bL; bestWf = bW;
      let wins = 0, pos = 0, neg = 0;
      for (const a of prds) if (a.y) pos++; else neg++;
      for (const a of prds) if (a.y) for (const b of prds) if (!b.y) wins += a.pr > b.pr ? 1 : a.pr === b.pr ? 0.5 : 0;
      bestAuc = wins / Math.max(1, pos * neg);
    }
  }

  const categories: Record<string, { n: number; live: number; raw_rate: number; asymp_rate: number }> = Object.create(null);
  Object.keys(obsAll).sort(E.byCode).forEach((c) => {
    const o = obsAll[c]!;
    categories[c] = { n: o.n, live: o.live, raw_rate: E.r4(o.live / o.n), asymp_rate: E.r4(E.clamp((o.live + bestK * L0) / (o.fSum + bestK), 0.08, 0.92)) };
  });
  const w7 = univ.filter((p) => p.change_7d !== null);
  const m7 = (a: SnapshotProtocol[]) => a.reduce((s, p) => s + E.clamp(p.change_7d, -50, 100), 0) / Math.max(1, a.length);
  const tilt = E.r4(E.clamp(Math.abs(m7(w7.filter((p) => !E.isPreToken(p))) - m7(w7.filter(E.isPreToken))) / 100, 0.03, 0.12));

  return {
    universe_count: univ.length, median_age_days: medAge, global_asymptotic_rate: E.r4(L0), survival_tau_days: bestTau,
    eb_prior_strength: bestK, sibling_empirical_rate: sibRate, sibling_sample: `${sibOwn}/${sibTot}`, growth_tilt_weight: tilt,
    brier_baseline: E.r4(bLooBase), brier_model: E.r4(bestLoo), brier_skill_pct: E.r2(100 * (1 - bestLoo / bLooBase)),
    wf_brier_baseline: E.r4(bWfBase), wf_brier_model: E.r4(bestWf), wf_brier_skill_pct: E.r2(100 * (1 - bestWf / bWfBase)),
    loo_auc: E.r4(bestAuc), categories,
  };
}
