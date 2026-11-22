# Benchmarks

Compares (A) ExtendScript files via `osascript`, (B) `ie3jp/illustrator-mcp-server`, (C) this project.
Methodology, results and targets: [docs/research/benchmarks.md](../docs/research/benchmarks.md).

| File | Purpose |
|------|---------|
| `micro.mjs` | Per-call latency and bulk-creation benchmark on a scratch document (closed without saving) |
| `runners.mjs` | The three runners behind one interface |
| `macro-metrics.mjs` | Agent-level metrics (time, calls, tokens, errors) from a Claude Code session transcript |
| `scenarios/` | Macro scenarios: prompt, reference image, quality checklist (`design-from-image.md` = M2, recreate design by image; `calendar.md` = 12-month calendar) |
| `compare-m2.sh` | M2: side-by-side and diff images + pixel RMSE of a run's PNG vs the reference |
| `results/` | Saved reports (`<local timestamp>-micro.md/.json`), M2 runs and the typed-tools calendar (PNGs + metrics; the `.ai` files are not committed) |

```sh
node bench/micro.mjs [--n=20] [--bulk=100] [--only=A,B,C,M] [--ie3=…/dist/index.js]   # M = full Chandelier MCP server (npm run build first)
node bench/macro-metrics.mjs <session.jsonl> [--since=ISO] [--until=ISO] [--label=name] [--json]
```

Needs Node ≥ 20 and a running Illustrator. Arm B needs the ie3 server built at `../illustrator-mcp-server/dist/index.js`
(or `--ie3=`).
