# Testing the recreate guide with fresh agents

How we check that [recreate.md](../plugin/skills/illustrator/recreate.md) is enough on its own: fresh subagents rebuild
the same reference, each on a new artboard in one document, and we compare. Used first on 2026-11-25 (worked
example below); results go to [benchmarks § 2g](research/benchmarks.md), guide gaps into recreate.md, tool bugs into
[bugs.md](bugs.md).

## The suite: several kinds of design

One reference trains a guide for that reference (seven rounds on one photo, 2026-11-25). The guide must work on any
design, so every change is checked on a **suite** of real jobs of different kinds, kept in the git-ignored
`tmp/recreate-suite/` (one folder per case: `reference.*`, `task.md` with size, scope, what is artwork vs photo and
the checks; `approved-result.*` and earlier runs for the evaluator only):

| Case | Kind | Tests |
|---|---|---|
| 01 | flat wall-calendar page (benchmark M2) | layout measuring, type, grids, editable text and styles |
| 02 | rendered mockup of a desk-calendar page | a page seen in a mockup, two panels, body copy, brand mark, leaving out the binding |
| 03 | product photo of several boxes, one front | picking one panel, given dieline size, logo and script wordmark, wave bands, photo placeholder |
| 04 | photographed box front with translucent ribbons | free-form curves, overlaps, curve-following shading, photo vs artwork |
| to come | logo/icon, flat illustration with gradients, poster, label | owner adds real jobs |

Rules: cases run **one at a time** (one Illustrator, one shared Chandelier session); each case has its own document
`tmp/recreate-suite/NN-case/runs.ai` laid out as below; a guide change counts when it doesn't make any case worse
(the owner's judgement per case), not when it fixes the case that prompted it. Fixes go into the general method; a
case-specific trick stays out of the guide.

## Layout of the test document

One Illustrator document, artboards in a row, all at the same scale and top edge:

| Position | Artboard | Content |
|---|---|---|
| leftmost | **Reference (original)** | the reference image, placed at the artwork's scale, on a locked **non-printing** layer "Reference" (previews and exports never show it) |
| next | **Baseline** | the best known version (e.g. the one made while writing the guide) |
| then, one per test → | **Test v2, v3, v4…** | each fresh agent's result, on its own artboard to the right of the previous one, with its own layers ("v2 …", "v3 …") and swatches |

Above each artboard a label names it ("v5 · tools · ~12 min", with the owner's verdict once given) on a locked,
non-printing layer "Version labels"; add one for every new test. Everyone can compare every version with the reference side by side in Illustrator. Nothing is overwritten: a test
only adds an artboard and layers.

## Running one test

0. **Unreleased features:** `npm run build`, then reconnect the session's Chandelier server (`/mcp` → reconnect, or
   restart the session) and check the tool's schema shows them. Agents never use `test/mcp-call.mjs` or anything
   else that reaches Illustrator outside the Chandelier tools (owner, 2026-11-25: v5 and v6 did, through a second
   server started from the shell — not allowed).
1. **Reset the shared session first** — agents in one Claude Code session share one Chandelier server, so a
   `configure` by an earlier agent changes everyone's frame ([bugs.md #9](bugs.md)):
   `configure {artboard: 0, units: "mm"}`.
2. **Label every artboard (required, owner 2026-11-26)** — the reference, the baseline and each run: a point text
   just above the artboard on the locked, non-printing layer "Version labels" (create it once): run name · method ·
   time · tool uses · rmse, e.g. "v10 · scene · 8.1 min · 47 calls · rmse 0.138"; add the owner's verdict when given
   ("· perfect"). Put a provisional label ("v3 · manual · running") when the artboard is added and complete it when the
   run reports. The same applies to benchmark documents (one label per arm).
3. **Add the artboard** to the right of the last one: `artboards {add, rect: [x, 0, w, h], name: "Front panel vN"}`
   with `x = previous x + w + 20 mm` (the same size as the baseline).
4. **Give the agent a clean folder** (`scratchpad/agent-vN/`) and note the start time.
5. **Start a fresh subagent** (background) with the prompt template below.
6. When it reports: **complete its label**, look at its artboard next to the reference and the others (preview each artboard at the same
   size), check its numbers (§ Evaluate), and record the run.

### Prompt template

Fill in the `<…>`:

```
You are testing whether a written method is enough to recreate a design in Adobe Illustrator. Work only from the
guide and the image — this is a test of the guide. Work efficiently: time and rounds are measured too.

## Task
In the open document <file>, recreate the design in <reference image> onto the empty artboard "<name>"
(index <i>, <w> × <h> mm). The reference is also placed on artboard "Reference (original)" (locked, non-printing).
<One sentence on what it is and what counts as artwork vs photo.>

## Read first, and follow
1. plugin/skills/illustrator/SKILL.md
2. plugin/skills/illustrator/recreate.md — THE method; follow it step by step. Where it is unclear, incomplete or
   wrong, note it — that is the main output of this test.

## Tools
- Illustrator: the mcp__chandelier__* tools. The server is SHARED: do NOT call configure on it; give artboard: <i>
  in every batch step.
- **Illustrator ONLY through the mcp__chandelier__* tools.** No `node test/mcp-call.mjs`, no osascript/AppleScript/JXA,
  no other process that talks to Illustrator. Long generated steps: write them to a JSON file in your folder and pass
  it as `batch {steps_file}`.
- Helper code as Node scripts in YOUR folder only: <scratch folder>, for data only (never to drive Illustrator). No Python.

## Rules (breaking them voids the test)
- Don't read other scratch folders, the job's output folder, docs/research/benchmarks.md, docs/bugs.md,
  docs/roadmap.md; don't copy or inspect the art of other artboards or their layers.
- Everything on NEW layers "<prefix> …", swatches "<prefix> …"; change nothing else.
- Save the document when done; leave it open.

## Report back (concise)
1. Final RMSE (preview {artboard, reference, reference_crop}) with the crop used, and per round.
2. Rounds, wall-clock start/end, Illustrator calls, time on code vs building/checking.
3. Guide: what worked, what was unclear/missing/wrong (section + what you needed) — most important.
4. Tool problems or errors.
5. Smoothness in full-size close-ups (middle and each corner); darkest/lightest spot tones vs the reference.
```

## Evaluate

- **The owner's judgement comes first.** RMSE and visual quality can disagree: in the worked example the run with
  the highest rmse (v2, 0.122) looked best — it kept the object's shape, what the shapes do at its edges, and crisp
  contrast. Ask, and record the reason.
- **Numbers that matter more than rmse:** tones at fixed points of the reference vs each version (render every
  artboard at 1 px per reference px; with a non-uniform scale map x and y separately), especially the darkest and
  lightest spots; full-size close-ups of the middle and every corner (tips, slivers, kinks, banding).
- **RMSE only within a run**, as a trend: runs that used different crops or scales aren't comparable.
- **Effort:** time, tool calls, tokens (the task notification gives tool uses and duration), rounds, share of time
  spent writing code.

## Record

1. A row in the repeatability table in [benchmarks § 2g](research/benchmarks.md): run, guide version, time, tool
   calls / tokens, rounds, rmse with its crop, the owner's judgement.
2. Every guide gap the agent reported (and what made the preferred version better) → recreate.md, in the section
   where an agent would need it; mention it in the guide's header line.
3. Tool problems → [bugs.md](bugs.md) (mark ones not yet reproduced).
   Runs with the `scene` tool (server started with `CHANDELIER_SCENE=1`, build and reconnect first): also record the
   analyze summary's first line, the edits used, refine rounds and what was still built by hand.
4. A change-log row in the [roadmap](roadmap.md); commit.

## Worked example (2026-11-25)

A photographed kraft box front with five translucent wave ribbons (job files in the git-ignored `tmp/`). Document:
Reference (original) · Front panel (baseline, RMSE 0.095) · v2 · v3 · v4. v2 (first guide, ~24 min) was judged
best; v3 (updated guide, ~16 min) was flatter and lost the panel's shape — that fed the "object shape, edge
behaviour, tonal extremes" changes; v4 (~25 min) tested those and was judged worst: keeping one uniform scale on a
given artboard broke the panel shape, its colours were redder than the photo, ribbon ends hooked past the side —
that fed "map the panel onto the given artboard, one clip, hue and saturation, fewest whole shapes". Numbers: [benchmarks § 2g](research/benchmarks.md).
