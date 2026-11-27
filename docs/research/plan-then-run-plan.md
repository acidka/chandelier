# Plan-then-run: implementation plan

Status: plan, 2026-11-27, branch `future/plan-then-run`. Spec: [plan-then-run.md](plan-then-run.md) (proposal,
2026-11-26). Roadmap: [phase 8](../roadmap.md#phase-8--future-).
Grounded in the repo at `12687c7` (0.6.0). Measured 2026-11-27 (macOS 27.2, Node 22): `node scripts/schema-size.mjs` →
36 tools, 59,936 chars; the budget test (`test/unit/server.test.ts`) is `< 60_000`, so **64 bytes are free**.

## 0. Owner decisions

Proposed defaults are marked ▶. Work uses them until the owner says otherwise. Answered 2026-11-27 → § 0a.

| # | Question | Options | Why it matters |
|---|---|---|---|
| P-A | Schema budget | ▶ raise the test to 61 KB for this feature (~0.6 KB: `plan`, `plan_id`, `approve`) · trim other descriptions by 0.6 KB · show the options only when the mode is on (tool list changes at runtime) | 64 bytes are free |
| P-B | Agent's own documents | ▶ skip approval (`approve_own` on) · approve everything | A new document from scratch has nothing to protect; asking anyway turns into clicks on every build |
| P-C | Rehearsal | ▶ later (phase R7) and in place followed by undo (two calls, fast) · on a copy (slow, and Illustrator can't copy an unsaved document without the clipboard) | Shows the result before approval; spec left it open |
| P-D | Panel highlight | ▶ a "Show" button that selects the planned items on request · an overlay layer (changes the document, so ruled out) | Selection is the user's state; an overlay is a change |
| P-E | Team lock | ▶ `CHANDELIER_APPROVE=plan` in the environment locks the mode: `configure` can't turn it off · no lock | Teams that need the record |
| P-F | Where file output goes | ▶ no new `finish` key: `documents save` / `save_as` and `export` are ordinary plan steps that Chandelier runs last, after every other step succeeded · a `finish` key as in the proposal (+~250 bytes) | Same result for fewer bytes; `export` becomes a step only inside plans |
| P-G | `history` while the mode is on | ▶ `undo` allowed without a plan (it only takes changes back) and logged; `redo` needs a plan | Undo is the designer's safety net |

### 0a. Decisions taken

| # | Choice (owner, 2026-11-27) | Effect on the plan |
|---|---|---|
| P-A | Raise the budget test to 61 KB | `plan`, `plan_id`, `approve` added as options; the test comment records it |
| P-B | **Approve everything**, the agent's own documents too | No own-document exception: no `approve_own`, no own-document list in the runtime gate. A job that starts from scratch plans `documents new` + the build as one plan (§ 3.3: a plan may start without a target document) |
| P-C | Rehearsal later (R7), in place + undo | As proposed |
| P-F | Saves and exports are ordinary plan steps, run last | No `finish` key |
| P-D, P-E, P-G | Not asked: the ▶ defaults stand until the owner says otherwise | — |

## 1. What exists to reuse

| Need | Existing code | Gap |
|---|---|---|
| Step parsing and validation | `batch.run` (`src/tools/batch.ts`): per step `tools.get`, strict Zod parse, `tool.step()` → `Step {cmd, args, settings}`, `artboard` | Inline in `run`; extract `parseSteps()` so planning and running share it |
| One call, one undo step | `A.cmd.batch` (`core.jsx`) runs all steps in one Apple event (quirk C10) | — |
| Failure cleanup | `rollback`: removes `A.created` items only; `closeEmptyNew` | Doesn't revert edits, swatch/style changes or deletions → undo is needed (§ 3.6) |
| Undo | `history` → `app.undo()` (`place.jsx`) | Can't undo its own call (C10); Windows can merge two calls into one undo step under load (C31) |
| Ref resolution | `A.refs` (uuid, selection, `name:`, `layer:`, `artboard:`, `@n`), `A.layerOf`, `A.vb` | Needs a "resolve only" pass for counting, with `@n` reported as "items of step n" |
| Read-only command list | `READ_ONLY` in `A.dispatch` | Becomes the runtime gate's allow-list |
| Last call record | `A.last` (`status.last_call`): call, cmd, finished, created uuids | The plan run also records its `plan_id` |
| Multi-file dry run | `batch {files, dry_run}` → `eachFile` | Becomes the plan for multi-file jobs (R6) |
| Debug log | `CHANDELIER_LOG` / `_FILE` in `server.ts` `log()` | Plan, decision and run entries |
| Panel | `PanelTransport` (`say`, events, `message`), `src/cep/panel-core.js` | Needs a "card" message with Approve / Reject / Show |
| Elicitation | MCP SDK 1.32.2: `server.server.elicitInput({message, requestedSchema})`, client capability `elicitation` | Not used yet; which clients support it is unknown (R0) |
| Schema budget | `scripts/schema-size.mjs`, test `< 60_000` | P-A |

## 2. Tool surface

No new tool. Everything below is off unless the mode is on, and then it is all the agent needs.

```ts
// configure (+ CHANDELIER_APPROVE=plan, which also locks it on: P-E)
approve: z.enum(['off', 'plan']).optional(),
// batch
plan: z.literal(true).optional(),   // later: z.union([z.literal(true), z.literal('rehearse')]) (R7)
plan_id: z.string().optional(),
```

- `batch {steps, plan: true}` → the plan card (text) + `plan_id`. Nothing changes in the document. In elicitation or panel
  mode the call returns only after the designer answered (or after a timeout, as "no answer").
- `batch {plan_id}` → runs that plan. Any other key except `timeout` and `results` is refused: the steps are frozen.
- Server instructions grow only when the mode is on (an `APPROVE_NOTE` like `LEAN_NOTE`): "Changes need an approved
  plan: send the whole job as one `batch {steps, plan: true}`, show the card, then `batch {plan_id}`. One plan per job."
  So the default context doesn't grow.

## 3. Design

### 3.1 What needs a plan

| Class | Tools / actions | In plan mode |
|---|---|---|
| Read | `status` (not `launch`/`restart`), `configure`, `document_info`, `find_items`, `get_items`, `get_tree`, `fonts`, `preflight`, `preview`, `history undo` (P-G), `swatches list`, `styles list`, `layers list`, `artboards list`, `symbols list`, `documents list`, `scene analyze/edit` (Node only) | Always allowed |
| Session state | `selection`, `documents activate`, `layers activate`, `artboards activate` | Allowed (the user's view, not content) |
| Opens a document | `documents open` | Allowed (opening changes nothing) |
| Changes a document | `documents new` (P-B), every create, modify, transform, arrange, align, path_ops, edit_text, delete, effects, place, symbols, swatches/styles/layers/artboards writes, `scene build/refine`, `menu_command`, `run_script`, `history redo`, `data_merge`, `documents close` with `discard` of unsaved changes | Needs an approved plan (P-B: the agent's own documents too) |
| Writes files | `documents save/save_as`, `export`, `batch {files}` | Needs a plan; the card says whether a path already exists (an overwrite) |
| Restarts | `status {restart}` | Already refused while anything is unsaved; allowed |

The table lives in one module (`src/plan/classify.ts`), with a unit test that every tool in `TOOLS` is classified, so a
new tool can't slip past the gate.

### 3.2 The gate (enforced twice)

1. **Node** (`callTool` in `server.ts`, before `run`/`step`): a tool or action of class "changes" or "writes" without
   a valid plan run is refused before anything reaches Illustrator, with how to plan it.
2. **Runtime** (`A.dispatch`): `req.settings.approve = {mode, plan: token|null}`. A command not in
   `READ_ONLY` ∪ session-state, without the token of the plan being run, throws
   `Needs an approved plan (configure approve: "plan")`. This also covers `run_script` and `scene build`, which reach
   the runtime through their own paths. The token is a random per-run value Node passes only in the `batch {plan_id}`
   call and its undo call; the agent never sees it.

### 3.3 Making a plan (`batch {steps, plan: true}`)

1. Node: `parseSteps()` (shared with the run): unknown tools, bad args, steps that can't be batch steps → error as today.
   `export` is accepted as a step here (P-F).
2. Runtime: new read-only command `plan_probe {steps}` (in `READ_ONLY`). Per step, without changing anything:
   - resolve its refs with `A.refs` (`@n` → `{from_step: n}`, not resolved);
   - effect record: `{step, tool, action, count, by_layer, by_artboard, text_before (edit_text, first 3, 60 chars),
     creates (items[] length, grid count), names (swatches/styles/layers/artboards touched), opaque (run_script,
     menu_command)}`;
   - fingerprint of the document: `{name, path, saved, items: pageItems.length, layers: names, artboards: count,
     refs: [[uuid, bounds rounded to 0.1 pt]]}` (only the resolved items, capped at 5 000 → a hash beyond).
   A plan whose first step is `documents new` has no document yet: the fingerprint is the list of open documents, the
   card says "new document W × H, n artboards", and later steps are counted from their arguments (their refs can only
   point at items the plan creates, `@n`).
   Effect counting per tool is a function next to each runtime command (`A.probe.<cmd>`), so the counts come from the
   same resolver as the run (spec risk "second code path"). A command without a probe is shown as opaque.
3. Node: file steps → `{path, format, exists}` (fs.stat). An existing path is an overwrite, said in the card.
4. `plan_id` = first 8 hex of sha256 over canonical JSON `{steps, document fingerprint, file list}`. Stored in a
   `Map` in `ctx.plans`: `{id, steps (parsed), probe, fingerprint, created_at, expires_at (+30 min), status:
   pending|approved|rejected|run|expired, decision: {by, channel, at, note}}`. At most 20 pending plans; older ones
   expire.
5. Card (text, ≤ 40 lines): the spec's layout. Order: opaque or unresolved steps first, then changes grouped by layer,
   text before → after, files written (new / overwrite), "Untouched", the undo note, and the channel line
   ("Approve in the panel" / "Waiting for your answer" / "Show this to the designer and wait for their reply").
6. Approval (§ 3.4). The reply carries `plan_id`, `status`, `channel`, the card, and on reject the note.

### 3.4 Approval channels

Picked per plan, strongest available first:

| Channel | When | How | Strength |
|---|---|---|---|
| Panel | `CHANDELIER_TRANSPORT=panel` and the panel connected | `T.card({id, text, items})` → the panel shows Approve / Reject (note) / Show (selects the planned items, P-D); the answer comes back as a `plan` event; `batch {plan: true}` waits up to `timeout` (default 300 s) | Hard: the click comes from Illustrator |
| Elicitation | Client declared `elicitation` | `server.server.elicitInput({message: card, requestedSchema: {decision: enum ["approve","reject"], note: string}})`; `accept` + approve → approved; `decline`/`cancel` → rejected | Hard: the client asks the person, the agent can't answer |
| Chat | Neither | The card is returned with "show it to the designer and wait for their reply"; `batch {plan_id}` counts as approval and the log says `channel: chat (soft)` | Soft, labelled |

`CHANDELIER_APPROVE_CHANNEL=panel|elicitation|chat` forces one (tests; a team that wants hard approval only can set
`panel` or `elicitation`, and then chat is refused).

### 3.5 Running a plan (`batch {plan_id}`)

1. Node: plan exists, not expired, not already run, approved (or chat channel) → else refused, with the reason and
   "make a new plan".
2. One runtime call `batch {steps, plan: {token, fingerprint, id}}`: **first** recompute the fingerprint inside the
   same Apple event and refuse on drift (nothing changed yet, so no race between check and run), then make the
   **undo marker** (§ 3.6), then the steps, as today, with `stop_on_error: true`.
3. All steps OK → Node runs the file steps in order (`documents save/save_as`, `export`) through their own tools,
   with the run token; a file step that fails is reported, earlier files stay (they can't be undone; the card says so).
4. Failure → § 3.6 undo, then the error reply: failed step, its error, "the document is back to the approved start" (or
   what is not).
5. Report: actual vs planned per step (`count` planned vs items actually created/changed from step results), files
   written, `undo: one step`. Mismatches are listed (they show a probe that is wrong).
6. Plan status → `run`; `A.last.plan = id`.

### 3.6 All or nothing (the hard part)

`app.undo()` inside the failing call does nothing for that call (C10), so the undo is a **second call**:
`history undo 1` with the run token, straight after the failed batch. Two risks, both checked in R0 before building on
them:

- **A failed call that changed nothing is not an undo step**: undo would then take back the designer's previous
  action. Fix: the run's first action in the document is a marker change that always makes an undo step (R0:
  create and remove a hidden 1 × 1 path in the same call, which Illustrator records, § 7). After
  the undo, the runtime checks that the fingerprint matches the plan's; if not, the error
  says exactly that and does not undo again.
- **Windows merges two calls under load (C31)**: one undo might also take back the call before. The fingerprint check
  after the undo catches it ("undo went further than the plan"); then `history redo 1` and a clear error. R0 measures
  how often on the VM.

A plan that starts with `documents new` (P-B) doesn't undo on failure: the document it made is closed without saving
(as `closeEmptyNew` does today, but also when it has items), so nothing of the plan stays open.

Without these guarantees, R3 falls back to: rollback of created items + a list of what stayed changed, and the docs say
"all or nothing" only on macOS.

### 3.7 Multi-file jobs (`batch {files, plan: true}`)

The plan runs today's `dry_run` (open → steps → close without saving) and adds per file `{path, mtime, size}`. The card
shows per-file step results and the output paths (`save copy` / `in_place` / exports, new or overwrite). The run checks
each file's mtime and size before opening it; a changed file is skipped and reported, the others run.

### 3.8 Log

`CHANDELIER_LOG` entries: `{plan: id, event: made|approved|rejected|expired|run|undone|drift, channel, steps, counts,
files, ms, note}`. No card text in the log (it can hold client text).

## 4. Phases

Each phase ends with unit tests green, `npm run lint:jsx`, docs updated (roadmap tick, change-log row, plan.md tables).

| Phase | What | Tests | Est. |
|---|---|---|---|
| **R0 Spike** (live, macOS + Windows VM) | `test/live-plan-spike.mjs` on its own document: (a) a batch that edits text, recolours, deletes and adds a swatch, then fails at the last step → `history undo 1` → all back? (b) a failed call that changed nothing → does undo take back the call before it? (c) marker candidates: which one Illustrator always records as a step; (d) C31 rate on Windows with the marker; (e) elicitation in Claude Code, Claude Desktop and Cursor (a tiny test server: does a form with an enum and a string show, what does decline return) | Spike results go to § 7 and `illustrator-quirks.md` | 0.5 d |
| **R1 Gate** | `configure {approve}`, `CHANDELIER_APPROVE` (+ lock); `src/plan/classify.ts` + "every tool classified" test; Node gate in `callTool`; runtime gate in `A.dispatch` (settings `approve`); `APPROVE_NOTE` in instructions | Unit: refusals per class (`documents new` too), lock; live: a changing call refused, read calls pass | 0.5 d |
| **R2 Plan** | `parseSteps()` extracted from `batch`; `plan_probe` + `A.probe.*` for every changing command (create_*, modify, transform, duplicate, arrange, align, path_ops, edit_text, delete, effects, swatches, styles, layers, artboards, symbols, place; opaque: run_script, menu_command); fingerprint; plan store; card renderer; chat channel | Unit: card text from fixtures, plan_id stable across key order, expiry, store cap; ES3 lint; live: card counts on a known document (`test/live-plan.mjs`) | 1.5 d |
| **R3 Run** | `batch {plan_id}`; drift check in the same call; marker + undo on failure with the after-check; file steps last; actual-vs-planned report; one run per plan | Unit (fake runtime): every refusal path; live: approved run = one undo step, drift refused (an item moved between plan and run), failed step → document back (fingerprint equal), overwrite said in card | 1 d |
| **R4 Elicitation** | channel selection, `elicitInput` with the card, timeout → "no answer"; forced channel env | Unit with an in-memory MCP client that answers approve / decline / cancel; manual check in the clients R0 found working | 0.5 d |
| **R5 Panel** | `card` message in `PanelTransport` + panel UI (Approve, Reject with note, Show = select planned uuids); `plan` event; works while the agent waits | Unit (panel protocol); live through the panel (`CHANDELIER_TRANSPORT=panel`); owner check of the UI | 1 d |
| **R6 Files** | `batch {files, plan: true}` = dry run + mtimes; per-file drift on run | Live with temp files (as `live-production.mjs`) | 0.5 d |
| **R7 Rehearse** (after P-C) | `plan: "rehearse"`: run in place, render a preview, undo (marker-checked); card gets the image | Live: document identical after a rehearsal (fingerprint + item count) | 1 d |
| **R8 Ship** | Docs (plan.md decision D17 + tool table, agent-guide section, skill, README "Approval mode" + numbers), benchmark: plan overhead (ms per probe on 100 / 5 000 items) and tokens (M2 C2 run with the mode on: one plan for the whole build, extra calls and tokens; a recolour job on an existing file: card size, calls), `scripts/schema-size.mjs` within P-A | Full unit + live suites, `claude plugin validate plugin` | 0.5 d |

Total ≈ 7 days; R0 decides whether § 3.6 holds as designed.

## 5. Exit criteria

- With `approve: "plan"`, no tool can change any document (or make a new one) without an approved plan: checked by a
  unit test over every tool/action class and a live test of each class (including `run_script` and `scene build`).
- An approved plan on a 2-step recolour + text job runs as **one** undo step; a plan whose step fails leaves the
  document equal to its approved start (fingerprint), on macOS; Windows result recorded (C31).
- Drift (an item moved, deleted or added between plan and run), expiry and a second run are refused.
- Card for that job ≤ 15 lines and says every file written and whether it overwrites.
- Elicitation works in at least Claude Code; the panel card works on macOS.
- Mode off: tool list ≤ 61 KB (P-A), instructions unchanged, all existing suites green, no extra calls.

## 6. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Undo after a failed call isn't reliable (§ 3.6) | "All or nothing" can't be promised | R0 first; marker + fingerprint check after undo; fall back to rollback + honest report |
| Probe counts differ from the run (e.g. `name:` glob matching items a previous step created) | Card under-states | Probe works step by step with `@n` as "from step n"; run report shows actual vs planned and flags differences |
| Fingerprint on huge documents is slow | Plan and run each pay it | Only resolved refs' uuids/bounds + counts; hash beyond 5 000; measured in R8 |
| Agents plan in small pieces | Back to many approvals | `APPROVE_NOTE` asks for one plan per job; the card shows "plan n of this session" |
| Chat approval can be faked | Soft guarantee | Labelled soft in card and log; `CHANDELIER_APPROVE_CHANNEL` can demand a hard channel |
| A client times out the waiting call (elicitation / panel) | The plan looks lost | The plan stays pending; `batch {plan_id}` after a later approval still works; reply says so |
| Schema budget | Every request re-reads it | P-A; options only, no new tool |

## 7. Spike results (R0)

2026-11-27, Illustrator 29.1 (ru_RU), macOS 27.2, Node 22.23, through the Chandelier MCP server 0.6.0 on a scratch
document (closed without saving afterwards). Quirk C35.

| Check | Result |
|---|---|
| (a) A batch edits text, recolours and moves a rect, deletes an ellipse, adds swatch S2, changes swatch S1's colour, adds a layer and a rect, then fails on step 7 (`name:Nope`) → `history undo 1` | ✅ Everything back: text, fill, position, the deleted ellipse, S1's colour (0,50,0,0 → 0,100,100,0), no S2, no layer, no new rect. Two read-only `run_script` calls between the batch and the undo were not undo steps |
| uuids after undo / redo | ✅ Unchanged (680–682) |
| (b) A batch that fails on step 0 (changes nothing) → `history undo 1` | ❌ Not an undo step: the undo took back the **previous** call (the setup batch); `history redo 1` brought it back. Confirms the § 3.6 risk |
| (c) Marker: create a hidden 1 × 1 path and remove it in the same call, then fail → `history undo 1` | ✅ The call was an undo step: the undo took back only it and the setup stayed. A second undo then removed the setup (stack as expected) |
| (d) C31 on Windows with the marker | ⏳ Not run yet (needs the VM) |
| (e) Elicitation in Claude Code, Claude Desktop, Cursor | ⏳ Not run yet (needs a small test server added to each client) |

Consequences for R3: the run's first action is the marker (create + remove a hidden path, § 3.6). A failed run then
always has its own undo step, so one `history undo` with the run token is safe on macOS. The fingerprint check after
the undo stays, for Windows (C31).
