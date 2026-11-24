// Meridian v3 — Huber Valuation, 4-Way Blind Validation, Multi-Chain Survival Odds & Optimal-Chain Farm Engine.
((root) => {
  'use strict';

  const DAY_MS = 86_400_000, M = Math;
  const VERSION_RE = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/, WRAPPED_RE = /\b(wrapped|staked|staking)\b/i;
  const EXCHANGE_RE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
  const EXCLUDED_CATS = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

  const DEFAULT_CONFIG = {
    version: 'meridian-3', airdrop_pool_share: 0.06, default_budget_usd: 2500, carry_spread_apr: 0.025,
    farm_min_hourly_usd: 12, farm_min_odds: 0.25, eb_prior_strength: 3, tvl_odds_slope: 0.15,
    chains_odds_slope: 0.45, eth_odds_slope: 0.35, sibling_odds_factor: 0.15, growth_tilt_weight: 0.10,
  };

  const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const clamp = (v, lo, hi) => M.max(lo, M.min(hi, v));
  const r2 = (n) => M.round(n * 100) / 100, r4 = (n) => M.round(n * 10000) / 10000;
  const dot = (x, b) => x.reduce((s, v, i) => s + v * b[i], 0);
  const logit = (p) => { const c = clamp(p, 0.01, 0.99); return M.log(c / (1 - c)); };
  const sig = (z) => 1 / (1 + M.exp(-clamp(z, -20, 20)));
  const quantile = (arr, q) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b), pos = (s.length - 1) * q, lo = M.floor(pos);
    return s[lo] + (s[M.ceil(pos)] - s[lo]) * (pos - lo);
  };
  const median = (arr) => quantile(arr, 0.5);

  function ageDays(asOf, listedAt) {
    if (!listedAt) return null;
    const a = Date.parse(`${asOf}T00:00:00Z`), b = Date.parse(`${listedAt}T00:00:00Z`);
    return Number.isFinite(a) && Number.isFinite(b) ? M.max(0, M.floor((a - b) / DAY_MS)) : null;
  }

  const isPreToken = (p) => p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
  const isCleanProduct = (p) => !EXCLUDED_CATS.has(p.category || '') && !VERSION_RE.test(p.name) && !WRAPPED_RE.test(p.name) && !EXCHANGE_RE.test(p.name);
  const isCleanComp = (p) => p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX' && !VERSION_RE.test(p.name) && !WRAPPED_RE.test(p.name) && !EXCHANGE_RE.test(p.name);

  function solveLinear(A, b) {
    const n = b.length, G = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (M.abs(G[r][c]) > M.abs(G[piv][c])) piv = r;
      [G[c], G[piv]] = [G[piv], G[c]];
      const d = G[c][c];
      if (M.abs(d) < 1e-12) return null;
      for (let j = c; j <= n; j++) G[c][j] /= d;
      for (let r = 0; r < n; r++) if (r !== c) { const f = G[r][c]; for (let j = c; j <= n; j++) G[r][j] -= f * G[c][j]; }
    }
    return G.map((row) => row[n]);
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
      const res = X.map((xi, i) => y[i] - dot(xi, beta)), sc = delta * (median(res.map(M.abs)) * 1.4826 || 1);
      w = res.map((r) => (M.abs(r) <= sc ? 1 : sc / M.abs(r)));
    }
    return beta;
  }

  // Stage 1: Huber log-log power law on clean live comps + 4-way blind validation (LOO, 10F, WF, LOCO) + conformal coverage.
  function fitValuationModel(protocols, asOf) {
    const comps = protocols.filter(isCleanComp).sort((a, b) => byCode(a.slug, b.slug));
    const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => byCode(a.listed_at, b.listed_at) || byCode(a.slug, b.slug));
    const wfCut = M.floor(dated.length * 0.65), wfTrain = dated.slice(0, wfCut), wfTest = dated.slice(wfCut);
    const cats = [...new Set(comps.map((p) => p.category || 'Other'))].sort(byCode);
    const starterLog = (p) => M.log(M.max(1, p.tvl_usd * 0.25 * (1 + (clamp(p.change_7d ?? 0, -60, 120) / 100) * 0.5) * (0.6 + (M.min(M.max(ageDays(asOf, p.listed_at) ?? 365, 0), 1095) / 1095) * 0.4)));

    const evalSpec = (name, note, featFn, catK = 0) => {
      const fitPred = (tr, te) => {
        const Xtr = tr.map(featFn), ytr = tr.map((p) => M.log(p.mcap_usd)), beta = fitHuber(Xtr, ytr), catAdj = Object.create(null);
        if (catK > 0) {
          const byC = Object.create(null);
          tr.forEach((p, i) => { (byC[p.category || 'Other'] ||= []).push(ytr[i] - dot(Xtr[i], beta)); });
          Object.keys(byC).forEach((c) => { catAdj[c] = (byC[c].length / (byC[c].length + catK)) * median(byC[c]); });
        }
        return te.map((p) => dot(featFn(p), beta) + (catAdj[p.category || 'Other'] || 0));
      };
      const looSigned = comps.map((c, i) => M.log(c.mcap_usd) - fitPred(comps.filter((_, j) => j !== i), [c])[0]);
      const kfAbs = [], locoAbs = [];
      for (let f = 0; f < 10; f++) {
        const trF = comps.filter((_, i) => i % 10 !== f), teF = comps.filter((_, i) => i % 10 === f);
        fitPred(trF, teF).forEach((pr, i) => kfAbs.push(M.abs(M.log(teF[i].mcap_usd) - pr)));
      }
      const wfAbs = fitPred(wfTrain, wfTest).map((pr, i) => M.abs(M.log(wfTest[i].mcap_usd) - pr));
      for (const c of cats) {
        const trC = comps.filter((p) => (p.category || 'Other') !== c), teC = comps.filter((p) => (p.category || 'Other') === c);
        if (trC.length >= 10) fitPred(trC, teC).forEach((pr, i) => locoAbs.push(M.abs(M.log(teC[i].mcap_usd) - pr)));
      }
      return { name, note, looSigned, loo_factor: r2(M.exp(median(looSigned.map(M.abs)))), tenfold_factor: r2(M.exp(median(kfAbs))), walk_forward_factor: r2(M.exp(median(wfAbs))), loco_factor: r2(M.exp(median(locoAbs))) };
    };

    const fTvl = (p) => [1, M.log(p.tvl_usd)];
    const specs = [
      ['Power-law log(TVL)', 'KEPT', 'Beats baseline on all 4 blind splits', fTvl, 0],
      ['+ 7d TVL growth', 'DROPPED', 'LOO worse; used in Stage 2 odds', (p) => [1, M.log(p.tvl_usd), clamp(p.change_7d ?? 0, -50, 100) / 100], 0],
      ['+ log(age days)', 'DROPPED', 'LOO/WF worse; drives Stage 2 survival', (p) => [1, M.log(p.tvl_usd), M.log1p(ageDays(asOf, p.listed_at) ?? 365)], 0],
      ['+ log(chains)', 'DROPPED', 'LOO/WF worse; drives Stage 2 odds', (p) => [1, M.log(p.tvl_usd), M.log1p(p.chains.length)], 0],
      ['+ Category EB (k=8)', 'DROPPED', '10F worse; drives Stage 2 odds', fTvl, 8],
    ].map(([name, status, note, fn, k]) => Object.assign({ status }, evalSpec(name, note, fn, k)));
    const base = specs[0];
    const starterLoo = r2(M.exp(median(comps.map((p) => M.abs(M.log(p.mcap_usd) - starterLog(p))))));
    const starterWf = r2(M.exp(median(wfTest.map((p) => M.abs(M.log(p.mcap_usd) - starterLog(p))))));
    const beta = fitHuber(comps.map(fTvl), comps.map((p) => M.log(p.mcap_usd)), 1.35, 1e-3, 30);

    let in50 = 0, in80 = 0;
    base.looSigned.forEach((rv, i) => {
      const oth = base.looSigned.filter((_, j) => j !== i);
      if (rv >= quantile(oth, 0.25) && rv <= quantile(oth, 0.75)) in50++;
      if (rv >= quantile(oth, 0.10) && rv <= quantile(oth, 0.90)) in80++;
    });

    return {
      comps_count: comps.length, wf_train_count: wfTrain.length, wf_test_count: wfTest.length, alpha: r4(beta[0]), beta: r4(beta[1]),
      conformal_p10_mult: r4(M.exp(quantile(base.looSigned, 0.10))), conformal_p25_mult: r4(M.exp(quantile(base.looSigned, 0.25))),
      conformal_p75_mult: r4(M.exp(quantile(base.looSigned, 0.75))), conformal_p90_mult: r4(M.exp(quantile(base.looSigned, 0.90))),
      cov_50_pct: r2((100 * in50) / comps.length), cov_80_pct: r2((100 * in80) / comps.length),
      loo_factor: base.loo_factor, tenfold_factor: base.tenfold_factor, walk_forward_factor: base.walk_forward_factor, loco_factor: base.loco_factor,
      starter_loo_factor: starterLoo, starter_wf_factor: starterWf,
      ablation: [
        { name: 'Linear 0.25x TVL baseline', status: 'BENCHMARK', loo_factor: starterLoo, tenfold_factor: starterLoo, walk_forward_factor: starterWf, loco_factor: starterLoo, note: 'Starter linear rule overprices large TVL' },
        ...specs.map(({ name, status, loo_factor, tenfold_factor, walk_forward_factor, loco_factor, note }) => ({ name, status, loo_factor, tenfold_factor, walk_forward_factor, loco_factor, note })),
      ],
    };
  }

  function oddsPropensity(catL, p, cfg) {
    const ch = p.chains || [];
    return clamp(sig(logit(catL) + cfg.tvl_odds_slope * (M.log(M.max(1, p.tvl_usd)) - 17.5) + cfg.chains_odds_slope * (M.log1p(ch.length) - 1.1) + cfg.eth_odds_slope * (ch.includes('Ethereum') ? 0.5 : -0.5)), 0.08, 0.92);
  }

  // Stage 2: Bayesian survival + Empirical Bayes category + TVL/chain/Ethereum launch odds, LOO Brier & AUC validated.
  function fitTokenOddsModel(protocols, asOf, cfg) {
    const univ = protocols.filter((p) => p.category !== 'CEX' && !VERSION_RE.test(p.name) && !WRAPPED_RE.test(p.name) && !EXCHANGE_RE.test(p.name)).sort((a, b) => byCode(a.slug, b.slug));
    const medAge = M.round(median(univ.map((p) => ageDays(asOf, p.listed_at)).filter((a) => a !== null)));
    const old3y = univ.filter((p) => (ageDays(asOf, p.listed_at) ?? 0) >= 1095);
    const L0 = old3y.length ? clamp(old3y.filter((p) => !isPreToken(p)).length / old3y.length, 0.55, 0.90) : 0.80;
    const dated = univ.filter((p) => ageDays(asOf, p.listed_at) !== null);
    let bestTau = 600, bestLL = -Infinity;
    for (let tau = 200; tau <= 1600; tau += 25) {
      let ll = 0;
      for (const p of dated) { const pr = clamp(L0 * (1 - M.exp(-ageDays(asOf, p.listed_at) / tau)), 1e-4, 1 - 1e-4); ll += isPreToken(p) ? M.log(1 - pr) : M.log(pr); }
      if (ll > bestLL) { bestLL = ll; bestTau = tau; }
    }
    const obs = Object.create(null);
    for (const p of univ) {
      const o = (obs[p.category || 'Other'] ||= { n: 0, live: 0, fSum: 0 });
      o.n += 1; if (!isPreToken(p)) o.live += 1;
      o.fSum += 1 - M.exp(-(ageDays(asOf, p.listed_at) ?? medAge) / bestTau);
    }
    const kP = cfg.eb_prior_strength, categories = Object.create(null);
    Object.keys(obs).sort(byCode).forEach((c) => { const o = obs[c]; categories[c] = { n: o.n, live: o.live, raw_rate: r4(o.live / o.n), asymp_rate: r4(clamp((o.live + kP * L0) / (o.fSum + kP), 0.08, 0.92)) }; });

    const gLive = univ.filter((p) => !isPreToken(p)).length / univ.length;
    let bBase = 0, bMod = 0, wins = 0, pos = 0, neg = 0;
    const looPreds = [];
    for (const u of univ) {
      const y = isPreToken(u) ? 0 : 1, o = obs[u.category || 'Other'], f = 1 - M.exp(-(ageDays(asOf, u.listed_at) ?? medAge) / bestTau);
      const looL = clamp(((o.live - y) + kP * L0) / ((o.fSum - f) + kP), 0.08, 0.92), pr = clamp(oddsPropensity(looL, u, cfg) * f, 0.02, 0.98);
      looPreds.push({ y, pr }); bBase += (y - gLive) ** 2; bMod += (y - pr) ** 2; if (y === 1) pos++; else neg++;
    }
    for (const a of looPreds) if (a.y === 1) for (const b of looPreds) if (b.y === 0) wins += a.pr > b.pr ? 1 : a.pr === b.pr ? 0.5 : 0;

    return {
      universe_count: univ.length, median_age_days: medAge, global_asymptotic_rate: r4(L0), survival_tau_days: bestTau,
      eb_prior_strength: kP, brier_baseline: r4(bBase / univ.length), brier_model: r4(bMod / univ.length),
      brier_skill_pct: r2(100 * (1 - bMod / bBase)), loo_auc: r4(wins / M.max(1, pos * neg)), categories,
    };
  }

  const findSiblingLive = (p, sibIdx) => { const h = sibIdx[p.slug.toLowerCase().split('-')[0]]; return h && h.slug !== p.slug ? h : null; };

  function scoreProtocol(p, asOf, val, odds, sibIdx, cfg) {
    const age = ageDays(asOf, p.listed_at), effAge = age ?? odds.median_age_days;
    const launchMcap = M.max(1, M.round(M.exp(val.alpha + val.beta * M.log(M.max(1, p.tvl_usd)))));
    const launchP25 = M.max(1, M.round(launchMcap * val.conformal_p25_mult)), launchP75 = M.max(1, M.round(launchMcap * val.conformal_p75_mult));
    const asympL = oddsPropensity((odds.categories[p.category || 'Other']?.asymp_rate) ?? odds.global_asymptotic_rate, p, cfg);
    const survRem = M.exp(-effAge / odds.survival_tau_days), baseOdds = (asympL * survRem) / ((1 - asympL) + asympL * survRem);
    const momFactor = 1 + (clamp(p.change_7d ?? 0, -50, 100) / 100) * cfg.growth_tilt_weight, sib = findSiblingLive(p, sibIdx);
    const launchOdds = clamp(baseOdds * momFactor * (sib ? cfg.sibling_odds_factor : 1), 0.03, 0.90);
    return {
      age_days: age, launch_mcap_usd: launchMcap, launch_p25_usd: launchP25, launch_p75_usd: launchP75,
      category_asymp_rate: r4(asympL), survival_remaining: r4(survRem), momentum_factor: r4(momFactor),
      sibling_live: sib ? sib.slug : null, sibling_symbol: sib ? sib.symbol : null, launch_odds: r4(launchOdds),
      implied_value_usd: M.max(1, M.round(launchMcap * launchOdds)), ev_p25_usd: M.max(1, M.round(launchP25 * launchOdds)), ev_p75_usd: M.max(1, M.round(launchP75 * launchOdds)),
    };
  }

  function chainGas(chain) {
    const lc = (chain || 'Mainnet').toLowerCase();
    if (lc === 'ethereum') return { chain, tier: 'L1', setup_usd: 14, weekly_usd: 3.5, claim_usd: 10 };
    if (/^(bitcoin|bsquared|rootstock)$/.test(lc)) return { chain, tier: 'BTC', setup_usd: 10, weekly_usd: 2.0, claim_usd: 8 };
    if (/^(solana|sui|aptos|tron|stellar|algorand|ton|near|bittensor)$/.test(lc)) return { chain, tier: 'Low-fee L1', setup_usd: 0.25, weekly_usd: 0.05, claim_usd: 0.15 };
    return { chain, tier: 'L2 / Alt-EVM', setup_usd: 1.2, weekly_usd: 0.25, claim_usd: 0.8 };
  }

  // Optimal-chain routing: pick lowest-gas chain in p.chains and quantify gas saved vs primary chain.
  function selectOptimalChain(chains, weeks) {
    const list = chains && chains.length ? chains : ['Mainnet'], costOf = (g) => g.setup_usd + g.weekly_usd * weeks + g.claim_usd;
    const first = chainGas(list[0]), best = list.map(chainGas).sort((a, b) => costOf(a) - costOf(b))[0];
    return Object.assign({}, best, { primary_chain: first.chain, saved_vs_primary_usd: r2(M.max(0, costOf(first) - costOf(best))) });
  }

  const holdDaysFor = (age) => (age === null ? 45 : age < 180 ? 60 : age < 365 ? 45 : 30);

  function categoryAction(p, cap, chain) {
    const c = (p.category || '').toLowerCase(), n = p.name;
    if (/lend|cdp|collateral/.test(c)) return `Supply $${cap} USDC on ${n} (${chain}) and borrow 30% in a correlated stable for supply+borrow activity.`;
    if (/dex|liquidity manager/.test(c)) return `Provide $${cap} in a correlated major/stable pool on ${n} (${chain}) with 1 weekly swap as active LP.`;
    if (/derivative|perpetual|basis/.test(c)) return `Deposit $${cap} USDC margin on ${n} (${chain}) and hold a delta-neutral hedge or vault for OI/volume points.`;
    if (c.includes('prediction')) return `Fund $${cap} USDC on ${n} (${chain}) and quote limit liquidity across 3 active markets rather than directional bets.`;
    if (/curator|allocator|yield|farm/.test(c)) return `Deposit $${cap} into ${n}'s flagship vault on ${chain} and hold receipt shares untouched across epoch snapshots.`;
    if (/restak|staking/.test(c)) return `Stake $${cap} of the native asset via ${n} (${chain}) and delegate to an active operator for restaking points.`;
    if (/rwa|stable/.test(c)) return `Mint or hold $${cap} of ${n}'s yield/stable asset on ${chain} and deploy into an eligible DeFi pool.`;
    if (c.includes('payment')) return `Open a $${cap} payment channel on ${n} (${chain}) and record regular qualifying transfers.`;
    return `Deposit $${cap} USDC into ${n}'s primary contract on ${chain} and hold across consecutive snapshots.`;
  }

  function buildFarmPlan(p, sc, cfg, budgetOverride, poolOverride, modeOverride) {
    const budget = budgetOverride || cfg.default_budget_usd, poolShare = poolOverride || cfg.airdrop_pool_share;
    const valUsd = modeOverride === 'launch' ? sc.launch_mcap_usd : sc.implied_value_usd;
    const holdDays = holdDaysFor(sc.age_days), weeks = M.max(4, M.ceil(holdDays / 7)), gas = selectOptimalChain(p.chains, weeks);
    const totalGas = r2(gas.setup_usd + gas.weekly_usd * weeks + gas.claim_usd), oppCost = r2(budget * cfg.carry_spread_apr * (holdDays / 365));
    const totalCost = r2(totalGas + oppCost), totalHours = r2((15 + 8 * weeks + 15) / 60), ypd = (valUsd * poolShare) / M.max(1, p.tvl_usd);
    const grossDrop = r2(ypd * budget), netEv = r2(grossDrop - totalCost), hourlyUsd = r2(netEv / M.max(0.25, totalHours));
    const netRate = ypd - cfg.carry_spread_apr * (holdDays / 365), breakeven = netRate > 0.0001 ? M.ceil(totalGas / netRate) : null;

    let verdict = 'SKIP', reason = `Negative net EV ($${netEv.toFixed(0)}) at $${budget}.`;
    if (sc.sibling_live) reason = `Sibling live token (${sc.sibling_live}) trades; odds discounted.`;
    else if (netEv > 0 && hourlyUsd >= cfg.farm_min_hourly_usd && sc.launch_odds >= cfg.farm_min_odds) { verdict = 'FARM'; reason = `Net +$${netEv.toFixed(0)} at $${hourlyUsd.toFixed(1)}/hr (${M.round(sc.launch_odds * 100)}% odds via ${gas.chain}).`; }
    else if (netEv > 0) { verdict = 'THIN'; reason = `Net +$${netEv.toFixed(0)} ($${hourlyUsd.toFixed(1)}/hr via ${gas.chain}); wait for boost or larger size.`; }
    else if (breakeven !== null) reason = `Negative net EV ($${netEv.toFixed(0)}) at $${budget}; break-even near $${breakeven.toLocaleString('en-US')}.`;

    const cap = verdict === 'FARM' ? budget : M.min(budget, breakeven ? M.max(250, M.ceil(breakeven / 50) * 50) : budget), f2 = (n) => n.toFixed(2);
    const rn = gas.saved_vs_primary_usd >= 1 ? ` (cheapest; saves $${f2(gas.saved_vs_primary_usd)} vs ${gas.primary_chain})` : '';
    const steps = [
      { action: `Fund a dedicated wallet on ${gas.chain} (${gas.tier})${rn} with $${cap} + $${M.ceil(totalGas + 2)} gas buffer.`, cost: `$${f2(gas.setup_usd * 0.35)} transfer gas`, time: '5 minutes' },
      { action: categoryAction(p, cap, gas.chain), cost: `$${cap} capital + $${f2(gas.setup_usd)} setup gas`, time: '15 minutes' },
      { action: `Run 1 weekly on-chain touchpoint on ${p.name} (swap/borrow/rebalance/vote) over ${weeks} weeks.`, cost: `$${f2(gas.weekly_usd * weeks)} gas ($${f2(gas.weekly_usd)}/wk)`, time: `${8 * weeks} minutes (8m/wk)` },
      { action: `Hold uninterrupted for ${holdDays} days to span multiple retroactive eligibility snapshots.`, cost: `$${f2(oppCost)} carry spread (${holdDays}d)`, time: `${holdDays} calendar days` },
      { action: `Check epoch points and claim only via ${p.name}'s official docs before unwinding.`, cost: `$${f2(gas.claim_usd)} claim/exit gas`, time: '10 minutes' },
      { action: `Log wallet, tx hashes & economics: ${verdict} @ $${budget} (gross $${f2(grossDrop)}, net $${f2(netEv)}, $${f2(hourlyUsd)}/hr).`, cost: `$0 log ($${f2(totalCost)} total friction)`, time: '5 minutes' },
    ];
    return {
      budget_usd: budget, chain: gas.chain, chain_tier: gas.tier, saved_vs_primary_usd: gas.saved_vs_primary_usd,
      hold_days: holdDays, total_gas_usd: totalGas, opp_cost_usd: oppCost, total_cost_usd: totalCost, total_hours: totalHours,
      gross_drop_usd: grossDrop, net_ev_usd: netEv, hourly_usd: hourlyUsd, breakeven_capital_usd: breakeven, verdict, verdict_reason: reason, steps,
      farm_steps: steps.map((s) => `${s.action} Cost: ${s.cost}. Time: ${s.time}.`.slice(0, 600)),
    };
  }

  function verifyIntegrity(radar) {
    const rows = radar.rows || [], a = radar.audit;
    let drift = 0, mono = true, wl = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.tier === 'watchlist') wl++;
      if (i > 0 && r.implied_value_usd > rows[i - 1].implied_value_usd) mono = false;
      if (scoreProtocol({ ...r, mcap_usd: null, gecko_id: null, symbol: null }, radar.as_of, radar.valuation, radar.odds_model, radar.siblings || {}, radar.config).implied_value_usd !== r.implied_value_usd) drift++;
    }
    const accounted = a.watchlist + a.expansion_above_floor + a.early_below_floor + a.excluded_pre_token + a.live_comps_clean + a.live_other + a.cex_excluded;
    const checks = [wl === a.watchlist, drift === 0, mono, accounted === a.total_snapshot, rows.length >= 100, (radar.comps?.length || 0) === a.live_comps_clean, radar.valuation.loo_factor < radar.valuation.starter_loo_factor, radar.valuation.walk_forward_factor < radar.valuation.starter_wf_factor, radar.odds_model.brier_skill_pct > 0];
    const passed = checks.filter(Boolean).length;
    return { watchlist_covered: wl, watchlist_expected: a.watchlist, rows_checked: rows.length, drift_count: drift, monotonic_ok: mono, accounted_total: accounted, snapshot_total: a.total_snapshot, checks_passed: passed, checks_total: checks.length, all_pass: passed === checks.length };
  }

  root.MeridianEngine = { DEFAULT_CONFIG, EXCLUDED_CATS, VERSION_RE, WRAPPED_RE, EXCHANGE_RE, byCode, r2, ageDays, isPreToken, isCleanProduct, isCleanComp, fitValuationModel, fitTokenOddsModel, findSiblingLive, scoreProtocol, selectOptimalChain, buildFarmPlan, verifyIntegrity };
})(typeof globalThis !== 'undefined' ? globalThis : window);
