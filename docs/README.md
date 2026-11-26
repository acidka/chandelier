# Chandelier — documentation

Chandelier is an MCP server that lets AI agents work in Adobe Illustrator **fast** (one persistent connection,
~5 ms per call), with **few calls** (batches, one-call checks and finishes) and with **full scripting power** when the
tools aren't enough. The [README](../README.md) is the short tour; this folder is the source of truth.

> Status: **0.5.3** (2026-11-25): npm `chandelier-mcp`, MCP Registry, Claude Code plugin, Claude Desktop bundle;
> macOS and Windows; the experimental [Chandelier panel](panel-plan.md) (chat, events, channel wake-up); new in 0.5.3: recreate tools (`preview {image, profile}`, `create_path {fit, shade}`) and a general recreate guide. See the
> [roadmap](roadmap.md).

## Use it

| Doc | What's in it |
|-----|--------------|
| [agent-guide.md](agent-guide.md) | How an AI agent should use Chandelier: build, compare with a reference, check, export, recover; `AIA.*` helper reference |
| [brand.md](brand.md) | Logo, colours, type, files and how to use them |

## How it's built and where it's going

| Doc | What's in it |
|-----|--------------|
| [plan.md](plan.md) | Goals, principles, architecture, decisions with **pros and cons**, tool catalogue, risks, testing |
| [roadmap.md](roadmap.md) | Phases, milestones (MVP … 0.5 ✅), checkboxes, exit criteria, change log |
| [bugs.md](bugs.md) | Known bugs and unverified parts, with workarounds and fix ideas |
| [recreate-testing.md](recreate-testing.md) | Testing the recreate guide with fresh subagents: reference artboard first, one artboard per test, prompt template, evaluation |
| [windows-plan.md](windows-plan.md) | The Windows version: bridge options, COM details, steps W0–W8, risks, decisions |
| [panel-plan.md](panel-plan.md) | The Chandelier panel (CEP, experimental in 0.5): chat, selection events, channel wake-up; design, protocol, live trials (P1–P5), limits |
| [logo-plan.md](logo-plan.md) | How the logo and GitHub hero were designed through Chandelier, and what that job found |

## Research and measurements

| Doc | What's in it |
|-----|--------------|
| [research/benchmarks.md](research/benchmarks.md) | Every measurement: per-call latency, the calendar and design-from-image agent benchmarks, the panel, targets |
| [research/illustrator-quirks.md](research/illustrator-quirks.md) | Known Illustrator 29.x failures and how Chandelier handles each one |
| [research/feature-gaps.md](research/feature-gaps.md) | Missing tools, user needs, all known competitors with pros and cons, proposed order for 0.1.x–0.4 (2026-11-23) |
| [research/competitors.md](research/competitors.md) | `ie3jp/illustrator-mcp-server` and Adobe's official MCP (beta): what they do, tool parity map |
| [research/plan-then-run.md](research/plan-then-run.md) | Proposal (phase 8 candidate): an opt-in mode where the designer approves a whole job once, then it runs at full speed |
| [research/scene-tool.md](research/scene-tool.md) | 0.6: the `scene` tool, image → editable vector scene, so free-form recreation needs fewer agent rounds (built behind `CHANDELIER_SCENE=1`, live check and suite evaluation pending) |
| [research/scene-plan.md](research/scene-plan.md) | The `scene` tool's implementation plan, owner decisions and task status |
| [../bench/README.md](../bench/README.md) | How to run the benchmarks (scripts and saved results) |

## Status legend (used in every doc)

| Mark | Meaning |
|------|---------|
| ✅ | Done |
| 🔄 | In progress |
| ⏳ | To do (planned) |
| ❓ | Needs a decision from the owner |
| 🧊 | Parked / later |
| ❌ | Rejected (kept for the record, with the reason) |

## Doc rules

- `docs/` is the source of truth. Any change to design, tools or process updates the docs in the same change.
- Every new doc is linked from this index.
- Measurements carry a date and an environment (Illustrator version, macOS, Node).
