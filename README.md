# meridian-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/xyjk0511/meridian-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/xyjk0511/meridian-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Meridian Token Launch Radar reads the sealed DefiLlama protocol snapshot (`758` protocols, `40` watchlist floor), fits an empirically validated **60/40 Stacked Ensemble** launch valuation model directly from the snapshot's own data (zero hardcoded protocol names), and outputs a zero-network warm-editorial interactive dashboard with multi-chain gas routing and costed farm verdicts (`FARM`, `THIN`, `SKIP`) in net `$/hour`.

## Key Architecture
- **Stage 1 — 60/40 Stacked Ensemble Valuation (`If-Launched MCap`)**: Blends `60%` **Hierarchical Huber-Ridge + Empirical Bayes** (`ln(TVL)`, `ln(ecosystem breadth)` with snapshot chain names excluded, bounded `7d TVL growth`, plus Huber-location EB shrinkage across category `k=6` and primary/all deployed chains `k=3`, `65%` primary weight) with `40%` **Slope-Adjusted Similarity Peer Kernel** over all `117` clean non-CEX live-token comparables. Validated blind across **4 splits** — Leave-One-Out (`2.77x`, `-44%` vs `4.99x` baseline), 10-Fold (`2.94x`, `-41%`), chronological Walk-Forward (`2.98x`, `-44%` vs `5.29x` baseline), and Leave-One-Category-Out (`3.18x`) — with out-of-sample conformal `[P25, P75]` intervals (`48.7%` 50%-coverage, `77.8%` 80%-coverage) and conformal rank bands.
- **Stage 2 — Dual-Blind Bayesian Survival Launch Odds (`P(Token)`)**: MLE age-survival hazard (`tau = 575d`) combined with LOO+WF grid-fitted Empirical Bayes category propensity (`k* = 8`), empirical 7-day TVL momentum tilt, and an empirical sibling independent-token rate directly measured from all `663` non-CEX/non-wrapped snapshot peers (`LOO Brier skill +12.82%`, `Walk-Forward Brier skill +22.33%`, `LOO AUC 0.723`).
- **Stage 3 — Coverage, Top 3 FARM Spotlight, Multi-Chain Gas Routing & Warm Editorial Dashboard**: Covers **100% (`40/40`)** of the watchlist plus **`164`** standalone clean pre-token DeFi protocols (`204` ranked total, zero CEX/wrapper/WBTC/USDT0 pollution, `758/758` audited). Surfaces actionable **Top 3 `FARM` Spotlight Cards** above the ranked board, compares gas costs across all deployed chains in the detail drawer (`81` gas-routed protocols quantifying `$ saved`, break-even safety margin, 4-bankroll matrix, 6 costed steps, and Sybil/dilution risk pills), plus **★ Pin Shortlist + Blended Portfolio Compare**, **⬇ CSV Export**, **Basis/Capital/Pool Sandbox**, and a **10/10 live `verifyIntegrity()` self-check** proving `$0` EV drift, `$0` farm drift, and `0` live leaks.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
node --test tests/radar.test.mjs
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=1wfaqr7c&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
