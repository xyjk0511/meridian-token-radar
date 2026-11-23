# meridian-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/xyjk0511/meridian-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/xyjk0511/meridian-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Meridian Token Launch Radar reads the sealed DefiLlama protocol snapshot (`758` protocols, `40` watchlist floor), fits an empirically validated two-stage launch valuation model directly from the snapshot's own data (zero hardcoded protocol names), and outputs a zero-network interactive dashboard with costed farm verdicts (`FARM`, `THIN`, `SKIP`) in net `$/hour`.

## Key Architecture
- **Stage 1 — Conditional Launch Valuation (`If-Launched MCap`)**: Robust Huber log-log power-law regression (`β ≈ 0.49`) fitted on all `117` clean non-CEX live-token comparables, validated blind across Leave-One-Out (`3.23x` vs `4.99x` linear baseline), 10-Fold (`3.30x`), and Walk-Forward (`2.79x`) splits, with out-of-sample conformal `[P25, P75]` intervals.
- **Stage 2 — Bayesian Survival Launch Odds (`P(Token)`)**: Empirical Bayes category launch propensity combined with an MLE age-survival hazard curve (`tau = 600d`, LOO Brier skill `+11.2%`), bounded 7-day TVL momentum tilt, and a data-driven sibling live-token detector.
- **Stage 3 — Costed Farm Economics & 6-Step Playbook**: Chain-tier gas schedule, carry spread, break-even capital, net `$/hr`, interactive budget switcher (`$500` / `$2.5K` / `$10K`), nearest 3 live-token comparables per protocol, and a live in-browser `verifyIntegrity()` self-check proving `0$` drift against `board.json`.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
node --test tests/radar.test.mjs
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=1wfaqr7c&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
