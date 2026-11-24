# meridian-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/xyjk0511/meridian-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/xyjk0511/meridian-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Meridian Token Launch Radar reads the sealed DefiLlama protocol snapshot (`758` protocols, `40` watchlist floor), fits an empirically validated two-stage launch valuation model directly from the snapshot's own data (zero hardcoded protocol names), and outputs a zero-network interactive dashboard with costed farm verdicts (`FARM`, `THIN`, `SKIP`) in net `$/hour`.

## Key Architecture
- **Stage 1 — Conditional Launch Valuation (`If-Launched MCap`)**: Robust Huber log-log power-law regression (`β ≈ 0.49`) fitted on all `117` clean non-CEX live-token comparables, validated blind across **4 splits** — Leave-One-Out (`3.23x` vs `4.99x` linear baseline), 10-Fold (`3.30x`), Walk-Forward (`2.79x`), and Leave-One-Category-Out (`3.42x`) — with out-of-sample conformal `[P25, P75]` intervals (`48.7%` 50%-coverage, `78.6%` 80%-coverage) and conformal rank intervals (`rank_lo–rank_hi`).
- **Stage 2 — TVL-Enhanced Bayesian Survival Launch Odds (`P(Token)`)**: Empirical Bayes category launch propensity combined with TVL-scale logistic tilt, an MLE age-survival hazard curve (`tau = 600d`, LOO Brier skill `+11.76%`, LOO AUC `0.708`), bounded 7-day TVL momentum tilt, and a data-driven sibling live-token detector.
- **Stage 3 — Multi-Bankroll Farm Economics & Interactive Sandbox**: Chain-tier gas schedule, carry spread, break-even capital, net `$/hr`, interactive **Basis (`Expected EV` / `If-Launched`) · Capital (`$500` / `$2.5K` / `$10K` / `$25K`) · Pool (`3%` / `6%` / `10%`)** sandbox, dual inline SVG hero charts (`Calibration Curve` + `2D Farm Matrix`), 4-bankroll scenario matrix in the detail drawer, unified `Model, Blind Tests & 758 Audit` tab, and a `9/9` live `verifyIntegrity()` self-check proving `0$` drift against `board.json`.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
node --test tests/radar.test.mjs
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=1wfaqr7c&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
