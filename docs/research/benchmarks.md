# Benchmarks

We compare three ways an AI agent can drive Illustrator — the two from the owner's field notes
(`illustrator-for-ai-agents.md`, 2026-11-21) plus ours:

| Arm | What | How the agent uses it |
|-----|------|-----------------------|
| **A** ExtendScript files | Agent writes a `.jsx`, runs it with `osascript … do javascript (POSIX file …)` (the owner's `run.sh`) | Bash tool |
| **B** `ie3jp/illustrator-mcp-server` | MCP, one small operation per tool call | MCP tools |
| **C** chandelier (this project; working name illustrator-agent until 2026-11-22) | Persistent bridge + runtime; MCP tools, `batch`, `run_script` | MCP tools |

Two levels:

- **Micro** (machine): latency per call and cost of building N objects. Automated: `bench/micro.mjs`. ✅ runs today.
- **Macro** (agent): a real job done by an agent end to end — wall time, tool calls, tokens, errors, result quality.
  Protocol below; metrics extracted from the session transcript with `bench/macro-metrics.mjs`. Arm C runs once phase 2 is done.

---

## 1. Micro benchmark

### How to run

```sh
# Illustrator running; any documents may be open (they're not touched).
node bench/micro.mjs                      # n=20 per-call scenarios, bulk=100
node bench/micro.mjs --n=50 --bulk=300 --only=A,C
node bench/micro.mjs --ie3=/path/to/illustrator-mcp-server/dist/index.js
```

Reports go to `bench/results/<local timestamp>-micro.{md,json}`.

**Safety:** the script creates its own scratch document, checks that it's the active document before every
scenario (aborts otherwise), and closes it **without saving** at the end — also on errors and Ctrl-C.

### Results — 2026-11-22 12:47, with the full Chandelier MCP server (runner M)

Same environment as below; ie3 1.13.0; n=20, bulk=100 · raw report:
[`bench/results/2026-11-22T12-47-38-micro.md`](../../bench/results/2026-11-22T12-47-38-micro.md).
M is the full server (`dist/index.js`) over MCP stdio, exactly as an agent calls it (B is measured the same way).

| Scenario | A ExtendScript | B ie3 MCP | C bridge only | **M Chandelier MCP** | M vs B |
|----------|---------------:|----------:|--------------:|---------------------:|-------:|
| S1 read artboards (median) | 131 ms | 287 ms | 3.1 ms | **4.9 ms** | 59× |
| S2 create rectangle | 129 ms | 274 ms | 4.4 ms | **7.2 ms** | 38× |
| S3 create text | 128 ms | 267 ms | 5.8 ms | **6.3 ms** | 42× |
| S4 200 objects, natural way | 170 ms (1 call) | 53 111 ms (200 calls) | 61 ms (1 call) | **117 ms (1 batch, typed tools)** | 454× |
| S5 batch of 200 one-object steps | — | — | — | **154 ms (1 call)** | — |
| S6 preview image round trip | — | 172 ms (export to file) | — | **68 ms (image returned)** | 2.5× |

The MCP layer adds 1–3 ms per call over the bare bridge. Typed tools in one batch (S4, S5) are as fast as a script.

### Scenarios

| ID | Work | A | B | C |
|----|------|---|---|---|
| S1 | Read the artboard list, N times | N × `.jsx` run | N × `get_artboards` | N × bridge call |
| S2 | Create one rectangle, N times | N × `.jsx` run | N × `create_rectangle` | N × bridge call |
| S3 | Create one 14 pt point text, N times | N × `.jsx` run | N × `create_text_frame` | N × bridge call |
| S4 | Build `bulk` rectangles + `bulk` texts | **1** `.jsx` run | **2 × bulk** calls (no batch or script tool) | **1** bridge call |

A and C run the **same ExtendScript source**; B runs the equivalent tools. Every run checks the number of items created.

### Results — 2026-11-22 (spike bridge)

Illustrator 29.1.0 (ru_RU UI) · macOS 27.2.1 · Apple M1 · Node 26.3.0 · ie3 1.13.0 · n=20, bulk=100 ·
raw report: [`bench/results/2026-11-22T00-55-21-micro.md`](../../bench/results/2026-11-22T00-55-21-micro.md)

| Scenario | A ExtendScript (median) | B ie3 MCP (median) | C ours (median) | C vs B |
|----------|------------------------:|-------------------:|----------------:|-------:|
| S1 read artboards | 150 ms | 320 ms | **5.3 ms** | 60× faster |
| S2 create rectangle | 158 ms | 333 ms | **6.3 ms** | 53× |
| S3 create text | 155 ms | 328 ms | **9.0 ms** | 36× |
| S4 200 objects, total | 226 ms (1 call) | **66 060 ms (200 calls)** | **96 ms (1 call)** | 690× |

Startup per session: A none · B 274 ms · C 54 ms. All 2 × 4 × 3 runs created exactly the expected items, 0 errors.

**What it means**
- Per call, **plumbing dominates** in A and B (process spawns, temp files, helper parsing): ~150 ms and ~330 ms of
  overhead for operations Illustrator itself finishes in a few ms. C's overhead is ~5 ms.
- B's real problem is that it **can't batch**: 200 objects = 200 calls = 66 s — and, for an agent, 200 tool results
  in the context (see macro). A and C do the same in one call.
- C's p95 (40–126 ms) comes from the first call in a series (dictionary warm-up) and occasional Illustrator redraws.
- C is the raw bridge without the MCP layer yet. Expected extra for MCP JSON-RPC + runtime dispatch: ~1–3 ms. To re-measure in phase 1.

## 1b. Windows (0.2, phase 7 W7) — 2026-11-24

**Environment:** Windows 11 Pro ARM64 26300 in a Parallels 27.1 VM (4 vCPU, 6 GB, "Adaptive hypervisor" on) on an
Apple M1 Mac, macOS 27.2; Illustrator 2027 (31.0.0) native ARM64, en_US, CPU preview; Node 26.13 ARM64. **These are
VM numbers, not hardware numbers:** the same call took 8–10 ms or 115–140 ms depending on the VM's state — most
likely Parallels' adaptive hypervisor, which gives the VM less CPU while a Mac app is in front (the fast runs were
taken while the owner had the VM window in front). Treat them as a floor for correctness, not as Windows speed.

**Per call** (details: [windows-plan § 12–13](../windows-plan.md#12-w1-results-2026-11-24)), p50:

| Path | VM fast state | VM slow state |
|---|---:|---:|
| Bare bridge, empty call (`1+1`) | 8.1–9.6 ms | 117–139 ms |
| Full MCP server, `run_script "return 1"` | ~20 ms (21–48 ms per run) | — |

**Micro runner M (and C) in the slow state** (`node bench/micro.mjs --only=C,M`, n=20, bulk=100; raw:
[`2026-11-24T02-57-47-micro.md`](../../bench/results/2026-11-24T02-57-47-micro.md), Illustrator window visible;
[`2026-11-24T02-58-57-micro.md`](../../bench/results/2026-11-24T02-58-57-micro.md), minimized — no difference):

| Scenario | C bridge only | **M Chandelier MCP** |
|----------|--------------:|---------------------:|
| S1 read artboards | 166 ms | 126 ms |
| S2 create rectangle | 110 ms | 95 ms |
| S3 create text | 134 ms | 147 ms |
| S4 200 objects (1 call) | 643 ms | 570 ms |
| S5 batch of 200 steps | — | 622 ms |
| S6 preview image | — | 187 ms |

The server adds nothing measurable over the bare bridge (M ≈ C); every per-call cost in the slow state is the VM.
One batch builds 200 objects in ~0.6 s even there — batching matters more on a slow machine, not less.
`bench/micro.mjs` runs on Windows since 2026-11-24 (runner C uses `bridge-win.ps1`; runners A and B stay macOS-only).
**The < 10 ms goal is a goal, not a 0.2 requirement** (owner, 2026-11-24): it can't be judged in a VM; measure on
x64 hardware when one is available.

## 2. Macro benchmark (agent level)

### Baseline from the owner's notes (2026-11-21)

Job: recreate a 12-page A4 calendar from one screenshot (from the maintainer's production work).

| | A ExtendScript | B ie3 MCP only | C ours |
|---|---|---|---|
| Wall time | **2.7 min** | 21.4 min | 2.6 C1 / 2.8 C2 min |
| Tool calls | **17** | 365 | 25 C1 / 23 C2 (target ≤ 20) |
| Output tokens | **13 k** | 108 k | 15.4 k / 16.8 k |
| Input tokens | **0.94 M** | 13.3 M | 1.20 M / 1.05 M |
| Errors along the way | none | four kinds (A7, A8, A9, A10) | 1 per arm in 3 runs |
| Change one parameter later | re-run 1 command | rebuild by hand | `styles update` / re-run the builder |
| Paragraph styles, global swatches, bleed | yes | not possible | yes (all 6 runs) |

The transcript of that MCP session (whole session, not just the build window)
shows 349 ie3 calls and **23 ie3 tool errors** — extracted with `macro-metrics.mjs`.

**Why input tokens explode with B:** every tool result stays in the conversation and is re-read on every later
model request. Cost grows roughly with *calls × context size*. That's why C focuses on **fewer calls**
(`batch`, `duplicate_items` to artboards, `run_script`) and **smaller results**, not just faster ones.

### Protocol (repeatable)

1. **Same job for every arm:** "Recreate the calendar layout from `<reference image>` as a 12-artboard A4 landscape
   CMYK document, months of 2027" (exact prompt and checklist in [`bench/scenarios/calendar.md`](../../bench/scenarios/calendar.md)).
2. **Same conditions:** fresh Illustrator start, Illustrator in the foreground, new Claude Code session, same model and
   effort, the project's agent guide loaded, nothing else running in Illustrator.
3. **Arm rules:**
   - A: only Bash + `.jsx` files (MCP servers disabled).
   - B: only `illustrator-mcp` tools (no `osascript` in Bash).
   - C: only `chandelier` tools; C1 = tools + `batch` without `run_script`, C2 = everything allowed.
4. **Record:** note the start/end time; then
   `node bench/macro-metrics.mjs ~/.claude*/projects/<dir>/<session>.jsonl --since=<start> --until=<end> --label=C1`.
5. **Quality check** (same checklist for every arm): 12 artboards named and sized right; dates correct for 2027;
   weekend colour; preview matches the reference within 2 pt on the checked elements; preflight clean;
   no orphan objects (`find_items` default 12 pt text = 0).
6. Run each arm **once** (owner's rule since 2026-11-22: saves time; earlier results are medians of 3); record results here with date and environment.

### Macro scenario M2 — recreate design by image

Job: rebuild a one-page Ukrainian calendar (January 2027 + two mini months) from one JPEG as editable vectors.
Prompt, reference image and 10-point quality checklist: [`bench/scenarios/design-from-image.md`](../../bench/scenarios/design-from-image.md).
Same conditions and arm rules as the protocol above; one run per arm (the 2026-11-22 tables below are medians of 3).

### Results — 2026-11-22 (3 runs per arm, median)

Illustrator 29.1.0 (ru_RU UI) · macOS 27.2.1 · Apple M1 · ie3 1.13.0 · model Claude Opus 5.5 (same effort for all runs) ·
each run in a fresh sub-agent · A and B loaded the owner's agent guide (`illustrator-for-ai-agents.md`); C2 had only our
tool descriptions and server instructions · files, per-run metrics and comparison images: `bench/results/m2/<run>/`.

C2 = **MVP-0** server (`src/server/`, 5 tools: `status`, `documents`, `run_script` with `AIA.*` helpers, `preview`, `inspect`).
C1 (typed tools, no `run_script`) isn't built yet.

| | A ExtendScript | B ie3 MCP only | C1 tools + batch | **C2 ours (MVP-0)** |
|---|---:|---:|---:|---:|
| Wall time | 2.5 min | 5.0 min | ⏳ | **1.0 min** |
| Model requests | 15 | 37 | ⏳ | **9** |
| Tool calls (Illustrator calls) | 16 (7) | 103 (84) | ⏳ | **13 (8)** |
| Input tokens | 0.81 M | 3.21 M | ⏳ | **0.38 M** |
| Output tokens | 13.4 k | 33.3 k | ⏳ | **6.2 k** |
| Tool errors | 1 | 1 | ⏳ | **0** |
| Quality (of 10) | 10 | 10 | ⏳ | 10 (runs: 10, 10, 9) |
| Pixel RMSE vs reference (lower = closer) | 0.115 | 0.097 | ⏳ | 0.136 |
| Global swatches / paragraph styles | yes (5 / 13) | not possible | ⏳ | swatches yes (4–5) / styles **none** |

Per run:

| Run | Wall | Requests | Tool calls | Input | Output | Errors | Quality | RMSE |
|-----|-----:|---------:|-----------:|------:|-------:|-------:|--------:|-----:|
| A1 | 2.5 min | 15 | 16 | 0.81 M | 13.4 k | 1 | 10 | 0.115 |
| A2 | 1.9 min | 9 | 10 | 0.46 M | 11.8 k | 0 | 10 | 0.131 |
| A3 | 3.0 min | 17 | 18 | 0.93 M | 17.6 k | 2 | 10 | 0.084 |
| B1 | 5.0 min | 37 | 103 | 3.21 M | 33.3 k | 1 | 10 | 0.097 |
| B2 | 5.3 min | 41 | 103 | 3.52 M | 33.9 k | 1 | 10 | 0.089 |
| B3 | 4.0 min | 30 | 91 | 2.41 M | 27.4 k | 1 | 10 | 0.125 |
| C2-1 | 1.1 min | 10 | 13 | 0.43 M | 7.1 k | 1 | 10 | 0.136 |
| C2-2 | 1.0 min | 9 | 13 | 0.38 M | 6.2 k | 0 | 10 | 0.120 |
| C2-3 | 1.0 min | 9 | 12 | 0.38 M | 5.9 k | 0 | 9 | 0.154 |

C2-3 fails Q8: "2027" set at the title's size (61 pt), 12 % wider than the reference, left edge 34 px (3 % of page width) off.
C2-1's one error was outside Illustrator (no Python PIL for an image comparison).

**What it means**
- **C2 is the cheapest by every cost measure:** vs A **2.5× faster, half the input and output tokens**, fewer requests;
  vs B **5× faster, 8× fewer tool calls, 8× fewer input tokens**. Zero Illustrator errors in all three runs.
- **Where the savings come from:** fewer model requests (9 vs 15), because the agent doesn't write a runner, doesn't hit the
  `.jsx` encoding trap (2 of 3 A runs did), and `preview` returns the image directly instead of export + Read. A part is the
  guide A and B read (~5 k tokens per request); that's a few percent of A's input, not the main effect.
- **Quality is a little weaker, not better.** All C2 runs pass on structure, dates, colours and fonts, but they did ≤ 1 fix round
  (A3 measured 15 elements and corrected them): median RMSE 0.136 vs A 0.115, and C2-3 missed the year size.
  The server makes building cheap but doesn't help the agent *check* its work. → add a reference comparison (`preview`
  with `reference` → side-by-side/diff + per-region offsets) and say "compare and fix" in the instructions.
- **No paragraph styles in any C2 run** (A made 13 each, prompted by the owner's guide). Our instructions should ask for
  global swatches **and** paragraph styles; `inspect` could flag text with no style.
- **Agent feedback on the tools** (all 3 runs): `documents new` has no name option (localised "Безымянный-1" until saved);
  `inspect` has no explicit missing-fonts field; unclear whether a re-run adds to or replaces content (one run wrote its own
  "clear page" step); `preview` size semantics (`max_px` = longest side) not stated; point text only.
- **Same B/A findings as before:** B costs 2× time, 6× calls, 4× input of A. B's only MCP error: `close_document` refuses after
  a PNG export marks the document as changed (our `preview` keeps the saved state, so C2 never hit it).
- **Safety:** run A3 left an empty unsaved "Untitled" document (closed afterwards). No C2 run left anything open.
- **Pixel RMSE** is a rough tiebreaker only (JPEG noise, different export sizes).

**Verdict for the "is it worth it" question:** yes on cost and reliability (the MVP-0 already beats both baselines on time,
calls, tokens and errors with ~730 lines of code, bridge included); the remaining gap is quality checking and style discipline, both cheap to
add (instructions + a compare tool), not architecture.

**Comparison script:** `bench/compare-m2.sh <run>` writes `<run>-vs-reference.png`, `<run>-diff.png` and prints the RMSE.

### Results — 2026-11-22, Chandelier after phase 3 (arms C1 and C2v2, 3 runs each, median)

Same scenario, prompt and method as above (fresh sub-agent per run, model Claude Opus 5.5, Illustrator 29.1.0 ru_RU,
macOS 27.2.1, Apple M1). Server: Chandelier with 32 tools (phases 1–3). C1 = typed tools + `batch`, **no `run_script`**;
C2v2 = all tools (the MVP-0 C2 runs above are kept for comparison). Quality checked by re-opening every `.ai`
(`document_info` + `preflight`: CMYK, 1 artboard, no raster, 0 unnamed items, 0 preflight errors/warnings) and the
side-by-side images. Files: `bench/results/m2/C1-n`, `C2v2-n` (`.ai` not committed).

| | A ExtendScript | B ie3 MCP | **C1 typed tools** | **C2v2 all tools** | C2 MVP-0 (earlier) |
|---|---:|---:|---:|---:|---:|
| Wall time | 2.5 min | 5.0 min | **2.1 min** | **1.2 min** | 1.0 min |
| Model requests | 15 | 37 | 13 | 12 | 9 |
| Tool calls (Illustrator calls) | 16 (7) | 103 (84) | **15 (11)** | **16 (11)** | 13 (8) |
| Input tokens | 0.81 M | 3.21 M | **1.01 M** | **0.85 M** | 0.38 M |
| Output tokens | 13.4 k | 33.3 k | 15.8 k | 7.7 k | 6.2 k |
| Tool errors (median / total of 3) | 1 | 1 | 0 / 1 | 0 / 1 | 0 / 1 |
| Quality (of 10) | 10 | 10 | **10, 10, 10** | **10, 10, 10** | 10, 10, 9 |
| Pixel RMSE vs reference | 0.115 | 0.097 | 0.131 | 0.145 | 0.136 |
| Global swatches / paragraph styles | 5 / 13 | — | 5 / **0** | 5 / **0** | 4–5 / 0 |

Per run:

| Run | Wall | Requests | Tool calls (Illustrator) | Input | Output | Errors | Quality | RMSE |
|-----|-----:|---------:|-------------------------:|------:|-------:|-------:|--------:|-----:|
| C1-1 | 2.1 min | 13 | 17 (11) | 1.02 M | 15.8 k | 0 | 10 | 0.148 |
| C1-2 | 2.2 min | 13 | 15 (11) | 1.01 M | 16.4 k | 1 | 10 | 0.131 |
| C1-3 | 2.0 min | 13 | 15 (11) | 0.99 M | 14.7 k | 0 | 10 | 0.126 |
| C2v2-1 | 1.2 min | 11 | 15 (10) | 0.76 M | 7.6 k | 0 | 10 | 0.124 |
| C2v2-2 | 1.3 min | 12 | 16 (12) | 0.85 M | 8.3 k | 1 | 10 | 0.145 |
| C2v2-3 | 1.2 min | 12 | 16 (11) | 0.85 M | 7.7 k | 0 | 10 | 0.153 |

The two errors: C1-2 guessed the default layer name "Layer 1" (it is "Слой 1" in the ru_RU UI); C2v2-2 passed `x:"0"`
as a string (schema validation). A first attempt at C1-2 was cut off by an API rate limit and discarded.

**What it means**
- **All six runs score 10/10**, including C1 without any scripting: the typed tools alone rebuild the page in one
  `batch` of ~25 steps. Every run did a preview check and preflight; 0 preflight issues, 0 leftover documents.
- **MVP targets** — C1: all met (≤ 4 min, ≤ 30 calls, ≤ 1.6 M, 10/10) except paragraph styles. C2v2: time, errors and
  quality met; **calls 16 > 12** and **input 0.85 M > 0.8 M** missed; paragraph styles missed.
- **Input tokens doubled vs MVP-0 although calls barely grew.** The tool list is now ~61 KB of schemas (~17.6 k tokens)
  that every model request re-reads; MVP-0 had 5 small tools. `create_text`, `create_path`, `create_shape` are the
  largest because their `items[]` repeats the full property schema. → phase 4: slim schemas (items as "same props"),
  shorter descriptions, maybe a tool subset per job.
- **No run made paragraph styles**, in any arm: the instructions mention them but don't ask for them. → phase 4.
- **C2 is faster than C1** (1.2 vs 2.1 min, half the output tokens): writing one builder script is cheaper than
  generating ~120 JSON items; C1 agents generated the batch JSON with a Node script (Bash), then pasted it.
- **Agent feedback** (several runs): localised default layer has no ref; `document_info` "runs per font" counts
  characters (240 for 121 frames — a bug); bleed shown as "unknown … not created here" for new unsaved documents (wrong
  wording); a `steps_file` option for big batches; a grid/table helper for `create_text`; swatch add-or-update for
  re-runnable batches; `preview` exact width; whether `run_script {file}` is non-ASCII safe; `AIA.*` `parent` only in
  the options object.

### Results — 2026-11-22, calendar macro on Chandelier (phase 4 exit; arms C1 and C2, 3 runs each, median)

Scenario, prompt and checklist K1–K10: [`bench/scenarios/calendar.md`](../../bench/scenarios/calendar.md) (12 A4-landscape
artboards for 2027 from one January screenshot). Fresh sub-agent per run, one at a time, model Claude Opus 5.5,
Illustrator 29.1.0 ru_RU, macOS 27.2.1, Apple M1, Node 26.3.0; the server is the phase 4 build (32 tools, 49.4 KB of
schemas). This time the agents **loaded only the tools they wanted** (the M2 runs above force-loaded all 32).
C1 = typed tools + `batch`, no `run_script`; C2 = all tools. Scoring: `node bench/score-calendar.mjs <run>` re-opens
the `.ai` (K1, K2, K9, K10 from `document_info` + `preflight`) and saves January next to the reference plus July and
December for the visual checks K3–K8. Files: `bench/results/calendar/<run>/` (`.ai` not committed).

| | Owner: ExtendScript (2026-11-21) | Owner: ie3 MCP | **C1 typed tools** | **C2 all tools** | Phase 4 target |
|---|---:|---:|---:|---:|---:|
| Wall time | 2.7 min | 21.4 min | **2.6 min** | **2.8 min** | ≤ 3 min ✅ |
| Model requests | — | — | 18 | 17 | |
| Tool calls (Illustrator calls) | 17 | 365 | **25 (19)** | **23 (18)** | ≤ 20 ❌ |
| Input tokens | 0.94 M | 13.3 M | **1.20 M** | **1.05 M** | ≤ 1.5 M ✅ |
| Output tokens | 13 k | 108 k | 15.4 k | 16.8 k | |
| Tool errors (median / total of 3) | 0 | 23 | 0 / 1 | 0 / 1 | 0 ✅ |
| Quality (of 10) | — | — | **10, 10, 10** | **10, 9, 9** | |
| Pixel RMSE, January vs reference | — | — | 0.159 | 0.130 | |
| Global swatches / paragraph styles | yes | no | 5 / 13 | 6 / 13 | yes ✅ |

Per run:

| Run | Wall | Requests | Tool calls (Illustrator) | Input | Output | Errors | Quality | RMSE | Swatches / styles |
|-----|-----:|---------:|-------------------------:|------:|-------:|-------:|--------:|-----:|------------------:|
| C1-1 | 2.2 min | 15 | 25 (19) | 0.94 M | 13.0 k | 0 | 10 | 0.168 | 5 / 13 |
| C1-2 | 2.6 min | 18 | 24 (18) | 1.20 M | 15.4 k | 1 | 10 | 0.153 | 5 / 13 |
| C1-3 | 2.7 min | 18 | 25 (19) | 1.22 M | 15.7 k | 0 | 10 | 0.159 | 5 / 13 |
| C2-1 | 3.5 min | 20 | 32 (24) | 1.25 M | 20.6 k | 1 | 10 | 0.130 | 6 / 13 |
| C2-2 | 2.8 min | 16 | 22 (17) | 0.94 M | 16.8 k | 0 | 9 | 0.132 | 6 / 13 |
| C2-3 | 2.5 min | 17 | 23 (18) | 1.05 M | 15.0 k | 0 | 9 | 0.130 | 6 / 13 |

Every run passed K1 (CMYK, 12 A4-landscape artboards with the right names, bleed 8.5 pt), K2 (1 468 live text frames,
no raster or outlines), K9 (every text has a paragraph style) and K10 (preflight 0 errors, 0 warnings); dates, ISO
weeks (January 53, 1–4; December 48–52), mini months and colours were right on the checked pages. C2-2 and C2-3 lose
K8: they drew a **printing** grey box in the photo area the prompt says to leave empty (C2-1 put it on a non-printing
layer, which passes). Errors: C1-2 tried `export` as a batch step; C2-1's own script moved a locked layer.

**What it means**
- **Time, tokens, errors and file quality meet the phase 4 exit; calls don't** (23–25 vs ≤ 20, the owner's ExtendScript
  run took 17). Against the ie3 MCP run: ~8× faster, ~15× fewer calls, ~11× fewer input tokens, 0 vs 23 errors.
- **Where the calls go** (C1-1): ~6 are the agent's own (read the image, load tool schemas, 2–3 Bash runs of a
  generator, hand-back); Illustrator calls are set-up (`status`, `fonts`, 2 × `configure`, `documents new`) 5,
  building 4 `batch`es, checking 5 `preview`s + `preflight` + `document_info`, finishing save/export/close 3.
  The build is already 3–4 calls; set-up and check rounds are what's left to cut.
- **C1 and C2 cost the same here** (unlike M2): typed agents generated the batch JSON with a Node script, script
  agents spent the saving on measuring rounds (C2-1 ran three).
- **Every run added the other artboards' offsets by hand** and four hit the bleed-inflated artboard spacing (C23)
  → fixed after the runs: `batch` step `artboard`, `AIA.at(k, fn)`, trim-edge `spacing`. Also reported: renders
  showed a non-printing layer only sometimes (C22, fixed); `AIA.pstyle` had no horizontal scale (added); no glyph
  (ink) bounds for text, so agents outlined copies to measure; `fonts` doesn't say whether a font is variable.

### M2 re-run on the phase 4 build — 2026-11-22 (arm C2, 1 run)

Same as the M2 runs above, run once (owner's call, to save time), agent loads its own tools.
Files: `bench/results/m2/C2v3-1/`.

| Run | Wall | Requests | Tool calls (Illustrator) | Input | Output | Errors | Quality | Swatches / styles |
|-----|-----:|---------:|-------------------------:|------:|-------:|-------:|--------:|------------------:|
| C2v3-1 | 1.5 min | 14 | 19 (13) | **0.70 M** | 8.9 k | 0 | 10 | 5 / **13** |

Against the MVP targets for C2: quality 10 ✅, time ≤ 2.5 min ✅, input ≤ 0.8 M ✅ (was 0.85 M), 0 errors ✅,
paragraph styles ✅ (was none); calls 19 vs the goal of 12 (13 to Illustrator; the call count is a goal, not an exit criterion). It started with mm units left over by the
calendar runs (session settings live as long as the server process; all runs shared one).

### Calendar re-run on the shorter build loop — 2026-11-22 (arms C1 and C2, 1 run each; phase 4 exit)

Same scenario, prompt and scoring as above, one run per arm (owner's rule). New in the server: `documents new {units}`
sets the session units, `preview {more, preflight, info}` is one check call, `documents save {export, close}` one finish
call, and the instructions say to skip `status`/`fonts` and aim for ~8 Illustrator calls. Illustrator 29.1.0 ru_RU,
macOS 27.2.1, Apple M1, Node 26.3.0, model Claude Opus 5.5. Files: `bench/results/calendar/C1v2-1/`, `C2v2-1/`.

| Run | Wall | Requests | Tool calls (Illustrator) | Input | Output | Errors | Quality | RMSE | Swatches / styles |
|-----|-----:|---------:|-------------------------:|------:|-------:|-------:|--------:|-----:|------------------:|
| C1v2-1 | 2.8 min | 15 | **19 (12)** | 0.95 M | 17.1 k | 0 | 9 | 0.125 | 6 / 13 |
| C2v2-1 | **2.0 min** | 14 | **17 (8)** | **0.78 M** | 12.0 k | 1 | 9 | 0.139 | 6 / 13 |

Against the phase 4 exit (each arm ≤ 20 calls, ≤ 3 min, ≤ 1.5 M input): **met by both arms.** Calls to Illustrator
fell from 18–19 to 12 (C1) and 8 (C2), the target the instructions name; C2 is now 2.0 min. K1–K7, K9, K10 pass in both
(dates, ISO weeks, mini months and colours checked on January, July, December); both lose K8 the same way C2-2/C2-3 did:
the photo area is a **printing** grey box on its own layer, where the prompt says to leave it empty.
- C1: 1 set-up call (`fonts`; no `status`, no `configure`), 4 `batch`es, 5 `preview`s (one region pair to measure
  the title and minis), 1 finish call. C2: `fonts`, `documents new`, 2 `run_script` builds, 1 check, 2 finish calls.
- C2's error: an export entry with `artboard: 0` (the key is `artboards`); the save had already happened. Both agents
  had to load the `export` schema to learn the keys → fixed after the runs: the `documents` description names the
  main keys and a bad export entry returns the accepted keys and "saved; not exported or closed".
- Both flagged `document_info` `unnamedText: 1408` as noise (dates inside named groups) → it now counts only text
  outside named groups.
- Other feedback: `create_text {grid}` cells can't be named; `col_props` takes any text prop (`paragraph_style` too)
  but the description shows only `{fill}`; whether `styles create` is safe to repeat; no default-swatch clean-up in
  the usual tool set (`swatches clean_defaults` exists).

### M2 on the MVP build — 2026-11-22 (arms C1 and C2, 1 run each; MVP exit)

Same M2 prompt and checklist as above, one run per arm, fresh sub-agent, the agent loads its own tools. The build has
the shorter loop (`documents new {units}`, `preview {preflight, info}`, `documents save {export, close}`) and the
phase 5 MVP items (MRAP retry, no empty leftover documents). Illustrator 29.1.0 ru_RU, macOS 27.2.1, Apple M1,
Node 26.3.0, model Claude Opus 5.5. Files: `bench/results/m2/C1v4-1/`, `C2v4-1/`. Checks: `bench/compare-m2.sh` and
the re-opened `.ai` (`document_info` + `preflight`).

| Run | Wall | Requests | Tool calls (Illustrator) | Input | Output | Errors | Quality | RMSE | Swatches / styles |
|-----|-----:|---------:|-------------------------:|------:|-------:|-------:|--------:|-----:|------------------:|
| C1v4-1 | 1.5 min | 9 | **10 (5)** | **0.48 M** | 9.8 k | 0 | 10 | 0.141 | 5 / 9 |
| C2v4-1 | **1.2 min** | 9 | **11 (7)** | **0.42 M** | 7.5 k | 0 | 10 | 0.132 | 5 / 13 |

Against the MVP targets: **every exit criterion met by both arms** — quality 10, time (≤ 2.5 / ≤ 4 min), input
(≤ 0.8 / ≤ 1.6 M), 0 errors, global swatches + a paragraph style on every text, 0 leftover documents — and the call
goals too (≤ 12 / ≤ 30). Against the baselines: C2 is 2× faster than ExtendScript files with half the input tokens,
4× faster than ie3 MCP with 8× fewer input tokens and ~9× fewer calls. Both files: CMYK, ratio 0.895 / 0.893
(page 0.894), 121 live text frames in Arial / Arial Bold, no issues, preflight 0 errors / 0 warnings.
- C1: `documents new`, one 36-step `batch` (`create_text {grid}`), one `preview {reference, preflight}`, one `styles
  update`, one `documents save {export, close}`. C2: `documents new`, one `run_script` builder, one check, two size
  fixes, one check, one finish call.
- Feedback: `col_props` doesn't say it takes `paragraph_style` (C1 used font/fill overrides for bold red weekends);
  grid cells can't be named; no font metrics (cap height) to size text from an image; `export` PNG default size
  (72 ppi) not stated.

### M2 through the Claude Code plugin — 2026-11-23 (arm C2, 1 run; 0.1 release check)

Chandelier installed as the published plugin (`/plugin install chandelier --marketplace acidka/chandelier`, server
`chandelier-mcp@0.1.0` via `npx`), same M2 prompt; the agent used the plugin's `illustrator` skill. Illustrator 29.1.0
ru_RU, macOS 27.2.1, Apple M1. Files: `bench/results/m2/C2p-1/`.

| Run | Wall | Requests | Tool calls | Input | Output | Tool errors | Quality | RMSE |
|-----|-----:|---------:|-----------:|------:|-------:|------------:|--------:|-----:|
| C2p-1 | 1.8 min | 22 | 26 | 1.18 M | 10.4 k | 6 | 10 | **0.108** |

**Not a cost result:** the plugin's `npx` started the server with the first `node` on the user's PATH, an nvm Node
15.14 (the server needs ≥ 22.15). On it `run_script` failed (`performance is not defined`) and every `preview` reply
was rejected by the client (invalid base64), so the agent worked around both (scripts as `batch` steps, renders read
from `save_to` files) — hence the extra calls and errors. The file itself is the closest to the reference of all runs
(RMSE 0.108; CMYK, 5 global swatches, 13 paragraph styles, 121 live texts, preflight clean). Fixed in **0.1.1**: the
server checks the Node version at startup and, if it is too old, answers with one `status` tool that explains the fix.

**Clean re-run on the fixed plugin** (plugin 0.1.2, `chandelier-mcp@0.1.1` on Node 22.23, 2026-11-23; files
`bench/results/m2/C2p-2/`):

| Run | Wall | Requests | Tool calls (Illustrator) | Input | Output | Tool errors | Quality | RMSE |
|-----|-----:|---------:|-------------------------:|------:|-------:|------------:|--------:|-----:|
| C2p-2 | **1.1 min** | 9 | **10 (5)** | **0.44 M** | 7.4 k | **0** | 10 | 0.145 |

Through the installed plugin, with its `illustrator` skill: the fastest and cheapest M2 run so far, all MVP targets
and the call goal met. 5 Illustrator calls: new document, one `run_script` builder, one `preview {reference,
preflight}`, one `documents save {export, close}` (plus the builder's re-check). 5 global swatches, 13 paragraph
styles, 121 live texts, preflight clean.

### M2 on Windows — 2026-11-24 (arm C2, 1 run; 0.2 exit)

Same M2 prompt with one note added: Illustrator runs on a Windows machine, so tools get Windows paths and the files go
to `C:\bench\m2\out\` (the reference image copied there). Setup: the 0.2.0 server ran in the VM's desktop session
behind a one-connection TCP relay, reached from the Mac through an SSH tunnel; a fresh headless Claude Code agent
(`claude -p`, Opus 5.5, only the `chandelier` server plus Read; it loaded the installed plugin's `illustrator` skill)
did the job. Environment as in § 1b. Files: `bench/results/m2/C2w-1/` (prompt, metrics, `.ai`, PNG, comparison).

| Run | Wall | Requests | Tool calls (Illustrator) | Input | Output | Tool errors | Quality | RMSE |
|-----|-----:|---------:|-------------------------:|------:|-------:|------------:|--------:|-----:|
| C2w-1 | **1.5 min** | 10 | **11 (6)** | **0.35 M** | 8.0 k | 0 Chandelier (1 Bash denied) | **10** | 0.170 |

Every MVP target met on Windows (quality 10, ≤ 4 min, ≤ 1.6 M input, ≤ 30 calls, no Chandelier errors): `documents
new`, one `batch` (5 global swatches, 9 paragraph styles, 121 texts, rules), `preview {reference, preflight}`, one fix
`batch`, a second check, `documents save {export, close}`. The re-opened file: CMYK, 1 artboard 570 × 637.5 pt (ratio
0.894), 121 live texts (Arial / Arial Bold), each with a paragraph style, no raster, layers "Main" and "Mini months",
preflight 0 errors / 0 warnings. The one error was outside Chandelier: the agent tried to measure the image with
Python in Bash, which the run didn't allow. RMSE is against a 570 × 638 px export (72 ppi), so not strictly
comparable with the macOS runs' 0.108–0.145.

### Metrics extractor

```sh
node bench/macro-metrics.mjs <session.jsonl> [--since=ISO] [--until=ISO] [--label=name] [--json]
```

Counts per API request (deduplicated by `requestId`): uncached input, cache writes, cache reads, output tokens.
Tool calls are grouped: `B ie3 MCP` (`mcp__illustrator-mcp__*`), `C our MCP` (`mcp__chandelier__*`, earlier `mcp__illustrator-agent__*`),
`A ExtendScript (Bash)` (Bash commands mentioning `osascript`, `run.sh` or `do javascript`; writing a `.jsx` file is not counted), `other`.
Tool errors are counted from `tool_result.is_error`.

## 2b. Phase 1 checks — 2026-11-22

Illustrator 29.1.0 (ru_RU) · macOS 27.2.1 · Apple M1 · Node 26.3.0 · script: `test/verify-assumptions.mjs` (through the MCP server)

Document: 100 groups × (40 rects + 9 point texts) + 100 groups = 5 000 objects (built in 0.6 s by one `run_script`).

| Read (median of 5) | Indexing `doc.pageItems` | Recursive walk (`AIA.walk`) |
|--------------------|-------------------------:|----------------------------:|
| Raw loop reading `name` of 5 000 items | 1 747 ms (619 ms with cached length) | **9 ms** |
| `find_items` count only | 1 921 ms | **49 ms** |
| `find_items` by fill colour | 1 968 ms | **122 ms** |
| `find_items` by name glob | 1 942 ms | **74 ms** |
| `find_items` text by size range | 1 926 ms | **66 ms** |
| `document_info` (with checks) | 1 283 ms | **243 ms** |
| `get_tree` depth 2 (300-node budget, 14.6 KB) | 26 ms | 25 ms |
| `name:` reference lookup | 1 898 ms | **44 ms** |

MCP round trip of an empty `run_script`: p50 5.7 ms, p95 13 ms (live suite, 30 calls) → target < 10 ms met.

Bridge only (micro benchmark arm C, n=20, after the C11 fix): S1 read artboards **2.8 ms**, S2 rectangle **3.1 ms**,
S3 text **5.4 ms**, S4 200 objects **49 ms** in one call (spike: 5.3 / 6.3 / 9.0 / 96 ms) —
[`bench/results/2026-11-22T09-38-19-micro.md`](../../bench/results/2026-11-22T09-38-19-micro.md).

Restart (`test/live-restart.mjs`): after Illustrator quits, `status` says `running:false`, tool calls fail in 3 ms with
"not running … status with launch:true" (no accidental launch), `status {launch:true}` relaunches in 7 s and the next
call reloads the runtime by itself — same MCP process and bridge throughout.

## 2c. Calendar with typed tools only — 2026-11-22 (phase 2 exit)

Script, not an agent: `test/calendar-tools.mjs` (same environment as above). Job: 12 artboards A4 landscape, 3 mm bleed,
Ukrainian month names, Monday-first grid, weekends in red, global swatches + 5 paragraph styles, frame built once on
artboard 0 and copied to all artboards with `duplicate_items {to_artboards:"all"}`.

| Build | MCP calls | Wall time | `run_script` | Check |
|-------|----------:|----------:|:------------:|-------|
| `configure`, `documents new`, 3 × `batch` (swatches + styles · frame + copy · 377 text items), `preview`, `document_info`, `documents save` | **8** | **1.3 s** | none | 365 day numbers in the right months, 116 red items (104 weekend days + 12 years), 0 orphans of 12 pt |

Result files: [`bench/results/calendar-tools/`](../../bench/results/calendar-tools/) (`calendar-2027.ai`, `january.png`, `july.png`).
This is the floor for an agent: it shows the tools can do the job in ≤ 20 calls; the agent-level macro run is phase 4.

## Tool list size

The tool list (names, descriptions, input schemas) is re-read on every agent request. `node scripts/schema-size.mjs`
(tokens ≈ characters / 3.5), 2026-11-24, Node 22.23:

| Version | Profile | Tools | Schemas | Instructions | ≈ tokens per request |
|---------|---------|-------|---------|--------------|----------------------|
| 0.4 | `full` (default) | 35 | 54 979 chars | 1 648 chars | 16.2 k |
| 0.4 | `CHANDELIER_TOOLS=lean` | 9 (8 + `tools`) | 15 407 chars | 1 789 chars | 4.9 k |
| 0.3 | `full` | 34 | 53 587 chars | 1 644 chars | 15.8 k |
| 0.3 | `lean` | 9 | 15 400 chars | 1 772 chars | 4.9 k |

History of the full list: 61.6 KB before phase 4 slimming, 48.9 KB after it (2026-11-22), 49.9 KB in 0.2.1. Clients
that defer tool loading (Claude Code, Claude Desktop) pay only for the names of tools they don't load.

## 2e. Production automation (0.3) — 2026-11-24

One run of `test/live-production.mjs` on the owner's Mac (Apple M1, macOS 27.2.1, Illustrator 29.1 ru_RU, Node 22.23),
times through the full MCP server:

| Call | Work | Time |
|------|------|------|
| `data_merge {dry_run}` | read a 3-row CSV, scan a 5-item template | 0.23 s |
| `data_merge` (artboards) | 3 rows → 3 artboards: text, image relink, colour, visibility | 0.22 s |
| `data_merge` (grid) | 3 rows, 2 per artboard → 2 artboards | 0.06 s |
| `data_merge {mode: "files"}` | 2 rows → 2 PNGs (fill, export, restore per row) | 4.7 s |
| `batch {files, dry_run}` | 2 files: open, 1 step, close | 6.1 s |
| `batch {files, out_dir, export}` | 2 files: open, 1 step, save copy, PNG, close | 13.6 s |

Opening, saving and exporting files dominate (Illustrator's own work, about 1–3 s each); the merge itself is fast.

## 3. Targets

| Metric | Target | Status |
|--------|--------|--------|
| Per-call overhead p50 (MCP → Illustrator → MCP) | < 10 ms (goal) | ✅ 5.7 ms through the full MCP server (macOS, 2026-11-22); Windows VM ~20 ms in its fast state, not judged (§ 1b) |
| 200 objects in one call | < 0.5 s | ✅ 96 ms (spike) |
| Calendar macro: tool calls | ≤ 20 | ✅ 19 / 17 (12 / 8 to Illustrator), C1 / C2 one run each on the shorter loop, 2026-11-22 (were 23–25) |
| Calendar macro: wall time | ≤ 3 min | ✅ 2.8 / 2.0 min (C1 / C2, 2026-11-22) |
| Calendar macro: input tokens | ≤ 1.5 M | ✅ 0.95 / 0.78 M |
| Calendar macro: errors / orphan objects | 0 | ✅ median 0 errors, 0 preflight issues |

## 4. Not yet benchmarked

- Adobe's official MCP (beta app only) — add as arm D when it reaches the stable app.
- Windows on real (x64) hardware: the 0.2 numbers (§ 1b) come from a Windows 11 ARM64 VM. Arm B (ie3) on Windows.
- Documents above 5 000 objects (5 000 measured in phase 1.6, see below).
