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

  const val = E.fitValuationModel(protocols, snapshot.as_of);
  const odds = E.fitTokenOddsModel(protocols, snapshot.as_of, cfg);
  const sibIdx = E.buildSiblingIndex(protocols);
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
      const sc = E.scoreProtocol(p, snapshot.as_of, val, odds, sibIdx, cfg);
      const fm = E.buildFarmPlan(p, sc, cfg, cfg.default_budget_usd);
      const peers = E.findNearestComps(p, cleanComps);
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

  const rows = scoredList.map(({ p, tier, sc, fm, peers }, i) => ({
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
    launch_p25_usd: sc.launch_p25_usd,
    launch_p75_usd: sc.launch_p75_usd,
    ev_p25_usd: sc.ev_p25_usd,
    ev_p75_usd: sc.ev_p75_usd,
    launch_odds: sc.launch_odds,
    category_asymp_rate: sc.category_asymp_rate,
    survival_remaining: sc.survival_remaining,
    momentum_factor: sc.momentum_factor,
    sibling_live: sc.sibling_live,
    sibling_symbol: sc.sibling_symbol,
    verdict: fm.verdict,
    net_ev_usd: fm.net_ev_usd,
    hourly_usd: fm.hourly_usd,
    total_gas_usd: fm.total_gas_usd,
    total_hours: fm.total_hours,
    breakeven_capital_usd: fm.breakeven_capital_usd,
    peers,
  }));

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
      predicted_mcap_usd: Math.round(Math.exp(val.alpha + val.beta * Math.log(p.tvl_usd))),
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

export function serializeDataScript(radar: Record<string, unknown>): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
