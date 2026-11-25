# meridian-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/xyjk0511/meridian-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/xyjk0511/meridian-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Meridian Token Launch Radar reads the sealed DefiLlama protocol snapshot (`758` protocols, `40` watchlist floor), fits every valuation and survival-odds term directly inside [`dashboard/engine.js`](dashboard/engine.js) on deduplicated one-per-ticker comparables (`n = 116`) with a strict dual-blind Keep/Drop rule, and renders a zero-network warm-editorial dashboard with per-row mental-math equations, per-category conformal intervals, multi-chain gas routing, and Minimum Viable Capital (`MVC`) farm verdicts (`FARM`, `THIN`, `SKIP`) in net `$/hour`.

## Key Architecture
- **Stage 1 — Closed-Form Dual-Blind Multiplicative Equation (`If-Launched MCap`)**: Deduplicates live comparables strictly to **one-per-ticker** (`n = 116`, dropping duplicate `BIFI` entry `bifi`) and fits `Base(TVL) × Eco × CatEB(k=10) × ChainEB(k=6, p=45%)` via Huber-Ridge IRLS + Huber-location Empirical Bayes shrinkage right inside `dashboard/engine.js` (`fitHuber`, `fitHierarchical`, `fitValuationModel`). Every term is kept **only** when improving both Leave-One-Out (`LOO`) and chronological Walk-Forward (`WF`, older half -> newer half):
  - **Benchmarks -> Meridian-6**: `0.25x` linear baseline (`LOO 4.89x`, `WF 5.24x`) -> Huber `ln(TVL)` (`LOO 3.31x`, `WF 2.57x`) -> `+ Category EB` (`3.24x / 2.38x`) -> `+ Chain EB` (`2.80x / 2.19x`) -> **`+ Ecosystem breadth (Meridian-6)` (`LOO 2.77x -43%`, `WF 2.16x -59%`, `10F 3.14x`, `LOCO 3.16x`)**.
  - **Explicitly Dropped from Stage 1**: `7d TVL growth` (hurts WF `2.22x`) and `raw log(age)` (hurts LOO `3.08x`) — both belong in Stage 2 launch-odds rather than Stage 1 size.
  - **Per-Category Conformal Intervals**: Category-scaled out-of-sample conformal `[P25, P75]` bands achieve **`50.0%`** exact out-of-sample 50%-coverage (`75.9%` 80%-coverage) and conformal rank intervals.
- **Stage 2 — Dual-Blind Bayesian Survival Launch Odds (`P(Token)`)**: Fitted directly in `dashboard/engine.js` (`fitTokenOddsModel`) over all `663` non-CEX/non-wrapped snapshot peers (`L0 = 86.4%`, MLE survival hazard `tau = 575d`, LOO+WF EB category shrinkage `k* = 8`, 7d TVL momentum tilt, and empirical live-sibling discount): **`LOO Brier skill +11.51%`, `Walk-Forward Brier skill +20.74%`, `LOO AUC 0.734`**.
- **Stage 3 — Clean Non-V2 Coverage, Per-Row Equations, MVC Sizing & Multi-Chain Gas Routing**: Covers **100% (`40/40`)** of the watchlist plus `19` expansion (`≥$50M`) and `134` early (`<$50M`) standalone pre-token DeFi protocols (**`193` ranked**, zero V2 pools, wrappers, or CEX leaks, `758/758` audited). Every table row shows its mental-math equation (`Implied EV = Launch × Odds`) and `MVC` tier; the warm-editorial cover embeds the calibration scatter + Dual-Blind Keep/Drop error bars + Top 3 `FARM` spotlight cards; the detail drawer renders the exact closed-form equation (`$0 drift` live `scoreProtocol()` recompute), nearest 3 one-per-ticker comps, multi-chain gas comparison bars (`75` gas-routed protocols), 4-bankroll MVC matrix, 6 costed/timed steps, and a **10/10 live `verifyIntegrity()` self-check**.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
node --test tests/radar.test.mjs
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=1wfaqr7c&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
