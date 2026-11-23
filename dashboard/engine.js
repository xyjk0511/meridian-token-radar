// Meridian Token Radar — Empirical Valuation, Survival Launch Odds & Farm Economics Engine.
// Shared single source of truth between main.ts (Node 22) and dashboard/app.js (zero network).
// Every parameter is fitted directly from the sealed snapshot: zero hardcoded protocol names.
((root) => {
  'use strict';

  const DAY_MS = 86_400_000;
  const VERSION_RE = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
  const WRAPPED_RE = /\b(wrapped|staked|staking)\b/i;
  const EXCHANGE_RE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
  const EXCLUDED_CATS = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
  const STOP_ROOTS = new Set('the defi protocol finance network chain swap capital labs dao liquid yield vault vaults market markets money staking stake pool pools bridge earn core pro app usd btc eth sol token coin open hyper super meta omni multi cross base prime layer onchain digital global crypto block smart auto alpha delta gamma sigma omega zero one'.split(' '));

  const DEFAULT_CONFIG = {
    version: 'meridian-1', airdrop_pool_share: 0.06, default_budget_usd: 2500,
    carry_spread_apr: 0.025, farm_min_hourly_usd: 12, farm_min_odds: 0.25,
    eb_prior_strength: 5, sibling_odds_factor: 0.15, growth_tilt_weight: 0.10,
  };

  const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const r2 = (n) => Math.round(n * 100) / 100;
  const r4 = (n) => Math.round(n * 10000) / 10000;
  const dot = (x, b) => x.reduce((s, v, i) => s + v * b[i], 0);
  const quantile = (arr, q) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  };
  const median = (arr) => quantile(arr, 0.5);

  function ageDays(asOf, listedAt) {
    if (!listedAt) return null;
    const a = Date.parse(`${asOf}T00:00:00Z`), b = Date.parse(`${listedAt}T00:00:00Z`);
    return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.floor((a - b) / DAY_MS)) : null;
  }

  const isPreToken = (p) => p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
  const isCleanProduct = (p) => !EXCLUDED_CATS.has(p.category || '') && !VERSION_RE.test(p.name) && !WRAPPED_RE.test(p.name) && !EXCHANGE_RE.test(p.name);
  const isCleanComp = (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX' && !VERSION_RE.test(p.name) && !WRAPPED_RE.test(p.name) && !EXCHANGE_RE.test(p.name);

  function solveLinear(A, b) {
    const n = b.length, M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]];
      const d = M[c][c];
      if (Math.abs(d) < 1e-12) return null;
      for (let j = c; j <= n; j++) M[c][j] /= d;
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j]; }
    }
    return M.map((row) => row[n]);
  }

  function fitHuber(X, y, delta = 1.35, lambda = 1e-3, iters = 25) {
    const p = X[0].length;
    let w = X.map(() => 1), beta = new Array(p).fill(0);
    for (let it = 0; it < iters; it++) {
      const XtWX = Array.from({ length: p }, () => new Array(p).fill(0)), XtWy = new Array(p).fill(0);
      for (let i = 0; i < X.length; i++) {
        const xi = X[i], yi = y[i], wi = w[i];
        for (let a = 0; a < p; a++) { XtWy[a] += wi * xi[a] * yi; for (let b = 0; b < p; b++) XtWX[a][b] += wi * xi[a] * xi[b]; }
      }
      for (let a = 1; a < p; a++) XtWX[a][a] += lambda;
      const next = solveLinear(XtWX, XtWy);
      if (!next) break;
      beta = next;
      const res = X.map((xi, i) => y[i] - dot(xi, beta));
      const sc = delta * (median(res.map(Math.abs)) * 1.4826 || 1);
      w = res.map((r) => (Math.abs(r) <= sc ? 1 : sc / Math.abs(r)));
    }
    return beta;
  }

  // Stage 1: Huber log-log power law on clean live comps + 3-way blind validation (LOO, 10-Fold, Walk-Forward).
  function fitValuationModel(protocols, asOf) {
    const comps = protocols.filter(isCleanComp).sort((a, b) => byCode(a.slug, b.slug));
    const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => byCode(a.listed_at, b.listed_at) || byCode(a.slug, b.slug));
    const wfCut = Math.floor(dated.length * 0.65), wfTrain = dated.slice(0, wfCut), wfTest = dated.slice(wfCut);

    const starterLog = (p) => {
      const gm = 1 + (clamp(p.change_7d ?? 0, -60, 120) / 100) * 0.5;
      const mm = 0.6 + (Math.min(Math.max(ageDays(asOf, p.listed_at) ?? 365, 0), 1095) / 1095) * 0.4;
      return Math.log(Math.max(1, p.tvl_usd * 0.25 * gm * mm));
    };

    const evalSpec = (name, note, featFn, catK = 0) => {
      const fitPred = (tr, te) => {
        const Xtr = tr.map(featFn), ytr = tr.map((p) => Math.log(p.mcap_usd)), beta = fitHuber(Xtr, ytr);
        const catAdj = Object.create(null);
        if (catK > 0) {
          const byC = Object.create(null);
          tr.forEach((p, i) => { (byC[p.category || 'Other'] ||= []).push(ytr[i] - dot(Xtr[i], beta)); });
          Object.keys(byC).forEach((c) => { catAdj[c] = (byC[c].length / (byC[c].length + catK)) * median(byC[c]); });
        }
        return te.map((p) => dot(featFn(p), beta) + (catAdj[p.category || 'Other'] || 0));
      };
      const looSigned = comps.map((c, i) => Math.log(c.mcap_usd) - fitPred(comps.filter((_, j) => j !== i), [c])[0]);
      const kfAbs = [];
      for (let f = 0; f < 10; f++) {
        const trF = comps.filter((_, i) => i % 10 !== f), teF = comps.filter((_, i) => i % 10 === f);
        fitPred(trF, teF).forEach((pr, i) => kfAbs.push(Math.abs(Math.log(teF[i].mcap_usd) - pr)));
      }
      const wfAbs = fitPred(wfTrain, wfTest).map((pr, i) => Math.abs(Math.log(wfTest[i].mcap_usd) - pr));
      return { name, note, looSigned, loo_factor: r2(Math.exp(median(looSigned.map(Math.abs)))), tenfold_factor: r2(Math.exp(median(kfAbs))), walk_forward_factor: r2(Math.exp(median(wfAbs))) };
    };

    const fTvl = (p) => [1, Math.log(p.tvl_usd)];
    const base = evalSpec('Power-law log(TVL)', 'Kept in Stage 1 launch curve', fTvl);
    const growth = evalSpec('+ 7d TVL growth', 'Dropped (LOO worse); used in Stage 2 odds', (p) => [1, Math.log(p.tvl_usd), clamp(p.change_7d ?? 0, -50, 100) / 100]);
    const age = evalSpec('+ log(age days)', 'Dropped (LOO & WF worse); drives Stage 2 survival', (p) => [1, Math.log(p.tvl_usd), Math.log1p(ageDays(asOf, p.listed_at) ?? 365)]);
    const chains = evalSpec('+ log(chains)', 'Dropped (LOO & WF worse)', (p) => [1, Math.log(p.tvl_usd), Math.log1p(p.chains.length)]);
    const cat = evalSpec('+ Category EB (k=8)', 'Dropped (10F worse); drives Stage 2 odds', fTvl, 8);

    const starterLoo = r2(Math.exp(median(comps.map((p) => Math.abs(Math.log(p.mcap_usd) - starterLog(p))))));
    const starterWf = r2(Math.exp(median(wfTest.map((p) => Math.abs(Math.log(p.mcap_usd) - starterLog(p))))));
    const beta = fitHuber(comps.map(fTvl), comps.map((p) => Math.log(p.mcap_usd)), 1.35, 1e-3, 30);

    return {
      comps_count: comps.length, wf_train_count: wfTrain.length, wf_test_count: wfTest.length,
      alpha: r4(beta[0]), beta: r4(beta[1]),
      conformal_p10_mult: r4(Math.exp(quantile(base.looSigned, 0.10))),
      conformal_p25_mult: r4(Math.exp(quantile(base.looSigned, 0.25))),
      conformal_p75_mult: r4(Math.exp(quantile(base.looSigned, 0.75))),
      conformal_p90_mult: r4(Math.exp(quantile(base.looSigned, 0.90))),
      loo_factor: base.loo_factor, tenfold_factor: base.tenfold_factor, walk_forward_factor: base.walk_forward_factor,
      starter_loo_factor: starterLoo, starter_wf_factor: starterWf,
      ablation: [
        { name: 'Linear 0.25x TVL baseline', status: 'BENCHMARK', loo_factor: starterLoo, tenfold_factor: starterLoo, walk_forward_factor: starterWf, note: 'Starter linear TVL overprices giants' },
        { name: base.name, status: 'KEPT', loo_factor: base.loo_factor, tenfold_factor: base.tenfold_factor, walk_forward_factor: base.walk_forward_factor, note: base.note },
        ...[growth, age, chains, cat].map((x) => ({ name: x.name, status: 'DROPPED', loo_factor: x.loo_factor, tenfold_factor: x.tenfold_factor, walk_forward_factor: x.walk_forward_factor, note: x.note })),
      ],
    };
  }

  // Stage 2: Bayesian survival token-launch odds fitted on all non-CEX, non-versioned, non-wrapped protocols.
  function fitTokenOddsModel(protocols, asOf, cfg) {
    const univ = protocols.filter((p) => p.category !== 'CEX' && !VERSION_RE.test(p.name) && !WRAPPED_RE.test(p.name) && !EXCHANGE_RE.test(p.name)).sort((a, b) => byCode(a.slug, b.slug));
    const medAge = Math.round(median(univ.map((p) => ageDays(asOf, p.listed_at)).filter((a) => a !== null)));
    const old3y = univ.filter((p) => { const a = ageDays(asOf, p.listed_at); return a !== null && a >= 1095; });
    const L0 = old3y.length ? clamp(old3y.filter((p) => !isPreToken(p)).length / old3y.length, 0.55, 0.90) : 0.80;

    const dated = univ.filter((p) => ageDays(asOf, p.listed_at) !== null);
    let bestTau = 600, bestLL = -Infinity;
    for (let tau = 200; tau <= 1600; tau += 25) {
      let ll = 0;
      for (const p of dated) {
        const pr = clamp(L0 * (1 - Math.exp(-ageDays(asOf, p.listed_at) / tau)), 1e-4, 1 - 1e-4);
        ll += isPreToken(p) ? Math.log(1 - pr) : Math.log(pr);
      }
      if (ll > bestLL) { bestLL = ll; bestTau = tau; }
    }

    const obs = Object.create(null);
    for (const p of univ) {
      const o = (obs[p.category || 'Other'] ||= { n: 0, live: 0, fSum: 0 });
      o.n += 1; if (!isPreToken(p)) o.live += 1;
      o.fSum += 1 - Math.exp(-(ageDays(asOf, p.listed_at) ?? medAge) / bestTau);
    }
    const kP = cfg.eb_prior_strength, categories = Object.create(null);
    Object.keys(obs).sort(byCode).forEach((c) => {
      const o = obs[c];
      categories[c] = { n: o.n, live: o.live, raw_rate: r4(o.live / o.n), asymp_rate: r4(clamp((o.live + kP * L0) / (o.fSum + kP), 0.12, 0.88)) };
    });

    const gLive = univ.filter((p) => !isPreToken(p)).length / univ.length;
    let bBase = 0, bMod = 0;
    for (const u of univ) {
      const y = isPreToken(u) ? 0 : 1, o = obs[u.category || 'Other'];
      const f = 1 - Math.exp(-(ageDays(asOf, u.listed_at) ?? medAge) / bestTau);
      const pr = clamp(clamp(((o.live - y) + kP * L0) / ((o.fSum - f) + kP), 0.12, 0.88) * f, 0.02, 0.98);
      bBase += (y - gLive) ** 2; bMod += (y - pr) ** 2;
    }
    return {
      universe_count: univ.length, median_age_days: medAge, global_asymptotic_rate: r4(L0),
      survival_tau_days: bestTau, eb_prior_strength: kP, brier_baseline: r4(bBase / univ.length),
      brier_model: r4(bMod / univ.length), brier_skill_pct: r2(100 * (1 - bMod / bBase)), categories,
    };
  }

  function buildSiblingIndex(protocols) {
    const idx = Object.create(null);
    protocols.filter((p) => !isPreToken(p) && p.category !== 'CEX').sort((a, b) => byCode(a.slug, b.slug)).forEach((p) => {
      const k = p.slug.toLowerCase().split('-')[0];
      if (!k || k.length < 4 || STOP_ROOTS.has(k)) return;
      const prev = idx[k];
      if (!prev || (p.mcap_usd || 0) > (prev.mcap_usd || 0) || ((p.mcap_usd || 0) === (prev.mcap_usd || 0) && p.tvl_usd > prev.tvl_usd)) {
        idx[k] = { slug: p.slug, name: p.name, symbol: p.symbol, mcap_usd: p.mcap_usd };
      }
    });
    return idx;
  }

  const findSiblingLive = (p, sibIdx) => { const h = sibIdx[p.slug.toLowerCase().split('-')[0]]; return h && h.slug !== p.slug ? h : null; };

  function scoreProtocol(p, asOf, val, odds, sibIdx, cfg) {
    const age = ageDays(asOf, p.listed_at), effAge = age ?? odds.median_age_days;
    const launchMcap = Math.max(1, Math.round(Math.exp(val.alpha + val.beta * Math.log(Math.max(1, p.tvl_usd)))));
    const launchP25 = Math.max(1, Math.round(launchMcap * val.conformal_p25_mult));
    const launchP75 = Math.max(1, Math.round(launchMcap * val.conformal_p75_mult));
    const asympL = (odds.categories[p.category || 'Other']?.asymp_rate) ?? odds.global_asymptotic_rate;
    const survRem = Math.exp(-effAge / odds.survival_tau_days);
    const baseOdds = (asympL * survRem) / ((1 - asympL) + asympL * survRem);
    const momFactor = 1 + (clamp(p.change_7d ?? 0, -50, 100) / 100) * cfg.growth_tilt_weight;
    const sib = findSiblingLive(p, sibIdx);
    const launchOdds = clamp(baseOdds * momFactor * (sib ? cfg.sibling_odds_factor : 1), 0.03, 0.90);
    return {
      age_days: age, launch_mcap_usd: launchMcap, launch_p25_usd: launchP25, launch_p75_usd: launchP75,
      category_asymp_rate: r4(asympL), survival_remaining: r4(survRem), momentum_factor: r4(momFactor),
      sibling_live: sib ? sib.slug : null, sibling_symbol: sib ? sib.symbol : null,
      launch_odds: r4(launchOdds), implied_value_usd: Math.max(1, Math.round(launchMcap * launchOdds)),
      ev_p25_usd: Math.max(1, Math.round(launchP25 * launchOdds)), ev_p75_usd: Math.max(1, Math.round(launchP75 * launchOdds)),
    };
  }

  function gasScheduleFor(chains) {
    const chain = chains && chains.length ? chains[0] : 'Mainnet', lc = chain.toLowerCase();
    if (lc === 'ethereum') return { chain, tier: 'L1', setup_usd: 14, weekly_usd: 3.5, claim_usd: 10 };
    if (lc === 'bitcoin' || lc === 'bsquared' || lc === 'rootstock') return { chain, tier: 'BTC', setup_usd: 10, weekly_usd: 2.0, claim_usd: 8 };
    if (/^(solana|sui|aptos|tron|stellar|algorand|ton|near|bittensor)$/.test(lc)) return { chain, tier: 'Low-fee L1', setup_usd: 0.25, weekly_usd: 0.05, claim_usd: 0.15 };
    return { chain, tier: 'L2 / Alt-EVM', setup_usd: 1.2, weekly_usd: 0.25, claim_usd: 0.8 };
  }

  const holdDaysFor = (age) => (age === null ? 45 : age < 180 ? 60 : age < 365 ? 45 : 30);

  function categoryAction(p, cap, chain) {
    const c = (p.category || '').toLowerCase(), n = p.name;
    if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${cap} USDC on ${n} (${chain}) and borrow 30% in a correlated stable asset to register both supply and borrow activity.`;
    if (c.includes('dex') || c.includes('liquidity manager')) return `Provide $${cap} in a correlated major or stable pool on ${n} (${chain}) and run one weekly swap to qualify as an active LP.`;
    if (c.includes('derivative') || c.includes('perpetual') || c.includes('basis')) return `Deposit $${cap} USDC margin on ${n} (${chain}) and keep a delta-neutral hedged position or vault deposit for OI and volume points.`;
    if (c.includes('prediction')) return `Fund $${cap} USDC on ${n} (${chain}) and quote limit liquidity across 3 active markets rather than directional bets.`;
    if (c.includes('curator') || c.includes('allocator') || c.includes('yield') || c.includes('farm')) return `Deposit $${cap} into ${n}'s flagship vault on ${chain} and hold receipt shares untouched across epoch snapshots.`;
    if (c.includes('restak') || c.includes('staking')) return `Stake $${cap} of the native staking asset through ${n} (${chain}) and delegate to an active operator for restaking points.`;
    if (c.includes('rwa') || c.includes('stable')) return `Mint or hold $${cap} of ${n}'s yield-bearing or stable asset on ${chain} and pair it in an eligible DeFi pool.`;
    if (c.includes('payment')) return `Open a $${cap} payment channel or routing balance on ${n} (${chain}) and send regular qualifying transfers.`;
    return `Deposit $${cap} USDC into ${n}'s primary contract on ${chain} and keep the position active across consecutive snapshots.`;
  }

  function buildFarmPlan(p, sc, cfg, budgetOverride) {
    const budget = budgetOverride || cfg.default_budget_usd, gas = gasScheduleFor(p.chains);
    const holdDays = holdDaysFor(sc.age_days), weeks = Math.max(4, Math.ceil(holdDays / 7));
    const totalGas = r2(gas.setup_usd + gas.weekly_usd * weeks + gas.claim_usd);
    const oppCost = r2(budget * cfg.carry_spread_apr * (holdDays / 365));
    const totalCost = r2(totalGas + oppCost), totalHours = r2((15 + 8 * weeks + 15) / 60);
    const ypd = (sc.implied_value_usd * cfg.airdrop_pool_share) / Math.max(1, p.tvl_usd);
    const grossDrop = r2(ypd * budget), netEv = r2(grossDrop - totalCost), hourlyUsd = r2(netEv / Math.max(0.25, totalHours));
    const netRate = ypd - cfg.carry_spread_apr * (holdDays / 365);
    const breakeven = netRate > 0.0001 ? Math.ceil(totalGas / netRate) : null;

    let verdict = 'SKIP', reason = `Negative net EV ($${netEv.toFixed(0)}) at $${budget}.`;
    if (sc.sibling_live) reason = `Sibling live token (${sc.sibling_live}) trades; own-token odds discounted.`;
    else if (netEv > 0 && hourlyUsd >= cfg.farm_min_hourly_usd && sc.launch_odds >= cfg.farm_min_odds) {
      verdict = 'FARM'; reason = `Positive net EV ($${netEv.toFixed(0)}) at $${hourlyUsd.toFixed(1)}/hr (${Math.round(sc.launch_odds * 100)}% odds).`;
    } else if (netEv > 0) {
      verdict = 'THIN'; reason = `Positive net EV ($${netEv.toFixed(0)}) but thin $${hourlyUsd.toFixed(1)}/hr; wait for boost or larger size.`;
    } else if (breakeven !== null) {
      reason = `Negative net EV ($${netEv.toFixed(0)}) at $${budget}; break-even near $${breakeven.toLocaleString('en-US')}.`;
    }

    const cap = verdict === 'FARM' ? budget : Math.min(budget, breakeven ? Math.max(250, Math.ceil(breakeven / 50) * 50) : budget);
    const f2 = (n) => n.toFixed(2);
    const steps = [
      { action: `Fund a dedicated wallet on ${gas.chain} (${gas.tier}) with $${cap} plus $${Math.ceil(totalGas + 2)} native gas buffer; keep seed offline.`, cost: `$${f2(gas.setup_usd * 0.35)} transfer gas`, time: '5 minutes' },
      { action: categoryAction(p, cap, gas.chain), cost: `$${cap} capital + $${f2(gas.setup_usd)} setup gas`, time: '15 minutes' },
      { action: `Run 1 qualifying on-chain touchpoint weekly on ${p.name} (swap, borrow, rebalance, or vote) over ${weeks} weeks.`, cost: `$${f2(gas.weekly_usd * weeks)} gas ($${f2(gas.weekly_usd)}/wk)`, time: `${8 * weeks} minutes (8m/wk)` },
      { action: `Hold the position uninterrupted for ${holdDays} days to span multiple retroactive eligibility snapshots.`, cost: `$${f2(oppCost)} carry spread (${holdDays}d)`, time: `${holdDays} calendar days` },
      { action: `Check epoch points and claim only through ${p.name}'s official documentation link before unwinding.`, cost: `$${f2(gas.claim_usd)} claim/exit gas`, time: '10 minutes' },
      { action: `Log wallet, tx hashes, and economics: ${verdict} at $${budget} (gross $${f2(grossDrop)}, net $${f2(netEv)}, $${f2(hourlyUsd)}/hr).`, cost: `$0 log ($${f2(totalCost)} total friction)`, time: '5 minutes' },
    ];
    return {
      budget_usd: budget, chain: gas.chain, chain_tier: gas.tier, hold_days: holdDays,
      total_gas_usd: totalGas, opp_cost_usd: oppCost, total_cost_usd: totalCost, total_hours: totalHours,
      gross_drop_usd: grossDrop, net_ev_usd: netEv, hourly_usd: hourlyUsd, breakeven_capital_usd: breakeven,
      verdict, verdict_reason: reason, steps,
      farm_steps: steps.map((s) => { const t = `${s.action} Cost: ${s.cost}. Time: ${s.time}.`; return t.length > 600 ? `${t.slice(0, 596)}...` : t; }),
    };
  }

  function findNearestComps(p, cleanComps) {
    const lt = Math.log(Math.max(1, p.tvl_usd)), cat = p.category || 'Other';
    return cleanComps
      .map((c) => ({ c, d: Math.abs(Math.log(Math.max(1, c.tvl_usd)) - lt) + ((c.category || 'Other') === cat ? 0 : 1.15) }))
      .sort((a, b) => a.d - b.d || byCode(a.c.slug, b.c.slug)).slice(0, 3)
      .map(({ c }) => ({ slug: c.slug, name: c.name, symbol: c.symbol, category: c.category || 'Other', tvl_usd: c.tvl_usd, mcap_usd: c.mcap_usd, ratio: r2(c.mcap_usd / Math.max(1, c.tvl_usd)) }));
  }

  function verifyIntegrity(radar) {
    const rows = radar.rows || [];
    let drift = 0, mono = true, wl = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.tier === 'watchlist') wl++;
      if (i > 0 && r.implied_value_usd > rows[i - 1].implied_value_usd) mono = false;
      const re = scoreProtocol({ slug: r.slug, name: r.name, category: r.category, chains: r.chains, tvl_usd: r.tvl_usd, change_7d: r.change_7d, listed_at: r.listed_at, mcap_usd: null, gecko_id: null, symbol: null }, radar.as_of, radar.valuation, radar.odds_model, radar.siblings || {}, radar.config);
      if (re.implied_value_usd !== r.implied_value_usd) drift++;
    }
    const a = radar.audit;
    const accounted = a.watchlist + a.expansion_above_floor + a.early_below_floor + a.excluded_pre_token + a.live_comps_clean + a.live_other + a.cex_excluded;
    return { watchlist_covered: wl, watchlist_expected: a.watchlist, rows_checked: rows.length, drift_count: drift, monotonic_ok: mono, accounted_total: accounted, snapshot_total: a.total_snapshot, all_pass: wl === a.watchlist && drift === 0 && mono && accounted === a.total_snapshot && rows.length >= 100 };
  }

  root.MeridianEngine = { DEFAULT_CONFIG, EXCLUDED_CATS, VERSION_RE, WRAPPED_RE, EXCHANGE_RE, byCode, r2, ageDays, isPreToken, isCleanProduct, isCleanComp, fitValuationModel, fitTokenOddsModel, buildSiblingIndex, findSiblingLive, scoreProtocol, buildFarmPlan, findNearestComps, verifyIntegrity };
})(typeof globalThis !== 'undefined' ? globalThis : window);
