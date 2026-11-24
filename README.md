# meridian-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/xyjk0511/meridian-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/xyjk0511/meridian-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Meridian Token Launch Radar reads the sealed DefiLlama protocol snapshot (`758` protocols, `40` watchlist floor), fits an empirically validated hierarchical two-stage launch valuation model directly from the snapshot's own data (zero hardcoded protocol names), and outputs a zero-network warm-editorial interactive dashboard with costed farm verdicts (`FARM`, `THIN`, `SKIP`) in net `$/hour`.

## Key Architecture
- **Stage 1 — Hierarchical Multi-Factor Launch Valuation (`If-Launched MCap`)**: Huber-Ridge regression on `ln(TVL)`, `ln(ecosystem breadth)` (with snapshot chain names automatically excluded), and bounded `7d TVL growth`, layered with Huber-location Empirical Bayes shrinkage across **category** (`k=22`) and **deployed chains** (`k=5`) fitted on all `117` clean non-CEX live-token comparables. Validated blind across **4 splits** — Leave-One-Out (`3.18x`, `-36%` vs `4.99x` baseline), 10-Fold (`3.34x`), chronological Walk-Forward (`2.70x`, `-49%` vs `5.29x` baseline), and Leave-One-Category-Out (`3.24x`) — with out-of-sample conformal `[P25, P75]` intervals (`49.6%` 50%-coverage, `78.6%` 80%-coverage) and conformal rank bands.
- **Stage 2 — Dual-Blind Bayesian Survival Launch Odds (`P(Token)`)**: MLE age-survival hazard (`tau = 575d`) combined with LOO+WF grid-fitted Empirical Bayes category propensity (`k* = 8`), empirical 7-day TVL momentum tilt, and an empirical sibling independent-token rate directly measured from all `663` non-CEX/non-wrapped snapshot peers (`LOO Brier skill +12.82%`, `Walk-Forward Brier skill +22.33%`, `LOO AUC 0.723`).
- **Stage 3 — Coverage, Optimal-Chain Gas Routing & Warm Editorial Dashboard**: Covers **100% (`40/40`)** of the watchlist plus **`164`** standalone clean pre-token DeFi protocols (`204` ranked total, zero CEX/wrapper/WBTC/USDT0 pollution, `758/758` audited). Automatically routes multi-chain protocols to their **lowest-gas eligible chain** (`81` gas-routed protocols quantifying `$ saved`), computes carry spread, break-even capital, net `$/hr`, 4-bankroll scenario matrix (`$500`–`$25K`), **★ Pin Shortlist + Blended Portfolio Compare**, **⬇ CSV Export**, **Basis/Capital/Pool Sandbox**, and a **10/10 live `verifyIntegrity()` self-check** proving `$0` EV drift, `$0` farm drift, and `0` live leaks.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
node --test tests/radar.test.mjs
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=1wfaqr7c&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
