# Plan-then-run approval mode (proposal)

Status: proposal, 2026-11-26; in progress since 2026-11-27 — [implementation plan](plan-then-run-plan.md) (🔄, [roadmap](../roadmap.md#phase-8--future-)). Shared version with a flow diagram:
<https://claude.ai/artifact/PyzfAnrJU8yqgXNnvw3zVM>.

## What it is

An opt-in approval mode: before a job changes a document, the agent sends Chandelier the whole job as one plan;
Chandelier checks it and shows the designer a short summary (what will be created, changed, deleted, saved and
exported, and where); the designer approves once; then the job runs at full speed as one undo step. It sits between
today's default (no approval) and Adobe's Illustrator (Beta) MCP (every change must be accepted in Illustrator).

For: designers who let an agent work in files they care about (client files, a brand master); teams that need a record
of what was approved and what ran; multi-file jobs, where a wrong step repeats across a folder.
Not for: building a new document from scratch — the agent only touches a file it created, so such documents skip
approval by default. **Owner, 2026-11-27: approve everything, the agent's own documents too** ([plan § 0a](plan-then-run-plan.md#0a-decisions-taken)).

## Flow

```
Agent plans ─▶ Chandelier checks ─▶ Designer reviews ─▶ Approved? ──yes──▶ Unchanged? ──yes──▶ Run the batch ─▶ Report
     ▲          (counts, hash,        (panel, elicitation,    │ no (note)          │ no                (one undo step;    (actual vs
     │           optional preview)     or chat)               │                    │                    all undone on      planned)
     └────────────────────────────────────────────────────────┴────────────────────┘                    failure)
```

## Tool design

No new tool: a setting plus options on `batch`, so the schema budget barely grows.

| Piece | Where | What it does |
|---|---|---|
| Mode switch | `configure {approve: "off" \| "plan"}`, or `CHANDELIER_APPROVE=plan` | `off` = today; `plan` = any call that changes a document needs an approved plan |
| Own documents | `configure {approve_own: true}` (default) | Documents the agent created this session skip approval |
| Make a plan | `batch {steps, plan: true}` | Validates every step, resolves refs, counts effects, returns a plan card and a `plan_id`; nothing changes |
| Rehearse | `batch {steps, plan: "rehearse"}` | Runs the steps on a temporary copy of the document, renders a preview, closes the copy |
| Run | `batch {plan_id}` | Runs only an approved, unchanged plan as one undo step; on a failure the whole batch is undone |
| Read-only tools | `get_items`, `find_items`, `preview`, `preflight`, `document_info`, `fonts`, `history` | Never need a plan |

While the mode is on, a changing call without a valid `plan_id` is refused with a message that says how to plan it —
the server enforces it, not the agent's instructions.

```json
{"tool": "batch", "plan": true,
 "steps": [
  {"tool": "swatches", "args": {"action": "recolor", "refs": "layer:Artwork", "to": ["Brand Navy", "Brand Orange"]}},
  {"tool": "edit_text", "args": {"refs": "name:Headline", "text": "Spring sale"}}
 ],
 "finish": {"export": [{"format": "pdf", "preset": "PDF/X-4", "path": "out/flyer.pdf"}]}}
```

`finish` is new: `batch` cannot save or export today, but files written to disk belong in the plan. `run_script`
steps are opaque (their effect is unknown before they run): the card flags them; `rehearse` shows their effect.

## The plan card

```text
Plan 7f3a · flyer.ai (not created by the agent) · 2 steps + export
  Change   148 items on layer "Artwork": colours → 2 brand swatches
  Change   1 text "Headline": "Summer sale" → "Spring sale"
  Write    out/flyer.pdf (PDF/X-4, new file)
  Untouched: 3 other layers, 2 artboards, the .ai file on disk
  Undo:    one step (Edit > Undo or history undo)
[Approve]  [Reject with a note]  [Show steps]
```

(Example values.) Always stated: documents and files touched and whether the agent created them; counts per action
grouped by layer or artboard; text as before → after; every file written and whether it overwrites one; opaque or
unresolved steps at the top; with `rehearse`, a preview next to the current state.

Where the card appears, strongest first:

1. **Chandelier panel** — Approve / Reject next to the artwork, planned items highlighted. The approval comes from
   Illustrator, not the agent. Needs the panel (experimental since 0.5).
2. **MCP elicitation** — the server asks the client to show the card and return the answer; the agent cannot approve
   its own plan. Only in clients that support elicitation.
3. **Chat** — the agent shows the card and waits for a reply. Works everywhere, but the server trusts the agent:
   a soft check, labelled so in the log.

Reject with a note returns the note to the agent; the old `plan_id` is dead.

## Safety

| Rule | How | If it fails |
|---|---|---|
| The plan is frozen | `plan_id` = hash of steps, `finish` and target documents; `batch {plan_id}` takes no other steps | New plan needed |
| No drift | Fingerprint at plan time: document path, item count, uuids and bounds of resolved items, layer list | Run refused, re-plan |
| Plans expire | 30 minutes by default, and on document close or restart (uuids change on reopen) | Run refused, re-plan |
| One plan, one run | A `plan_id` runs once | Second run refused |
| All or nothing | One undo step; on a failure Chandelier undoes it and reports the failed step | Document back to the approved start |

`finish` files cannot be undone: they are written last, only after every step succeeded, and never over an existing
file unless the card said so. Multi-file jobs (`batch {files}`) use today's `dry_run` report as their plan; drift is
checked per file (modified date) before each opens. Every plan, decision (who, when, which channel) and run result goes
to the `CHANDELIER_LOG` debug log.

## Compared with other approval models

| | No approval (Chandelier today) | Per change (Adobe Illustrator Beta MCP) | Plan Mode (Adobe AI Assistant) | Plan-then-run |
|---|---|---|---|---|
| Clicks per job | 0 | One per change | One per plan | One per plan; 0 in the agent's own documents |
| Speed once approved | ~5 ms per call | Waits on a person every change | In-app, not measured | ~5 ms per call |
| What is approved | Nothing | Each change, out of context | A plan in words | Steps, counts, text before → after, files; optional preview |
| Enforced by | Agent instructions | Illustrator | Illustrator | The server (panel / elicitation); chat is soft |
| Drift protection | — | Per change | Unknown | Fingerprint, expiry, one run per plan |
| Undo | Step by step | Per change | Unknown | Whole job in one step |
| Any agent | Yes | Cursor, Claude Code, Codex | Adobe's only | Yes |

Adobe's local MCP (private beta early 2027) has not said which model it will use.

## Costs and risks

| Cost or risk | Effect | Mitigation |
|---|---|---|
| Effect counting is a second code path | Plan and run can disagree | Counts use the run's ref resolver; the run report compares actual vs planned |
| `run_script` is opaque | Card can't say what it does | Flag it; offer `rehearse`; recipes can declare effects |
| Rehearsal on a copy is slow | Seconds for big files | Opt-in; the static plan is the default |
| Schema growth | More tokens per request | Options on existing tools; check `scripts/schema-size.mjs` |
| Agents plan in small pieces | Back to per-change clicks | Instructions ask for one plan per job; the card shows the job's plan count |
| Chat approval can be faked | Weak guarantee | Labelled soft; panel or elicitation for real enforcement |

## Open questions

- Default for `approve_own`: skip the agent's own documents, or approve everything?
- `rehearse` on a copy, or in place followed by undo (faster, but briefly changes the real document)?
- Which clients support MCP elicitation well enough (Claude Code, Claude Desktop, Cursor)? Needs a test.
- Panel highlight: select the planned items, or draw a temporary overlay layer?
- Can a team lock the mode on (an environment setting `configure` cannot turn off)?
