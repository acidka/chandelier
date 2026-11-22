# Chandelier — documentation

Chandelier is an MCP server that lets AI agents work in Adobe Illustrator **fast** (one persistent connection,
~5 ms per call), with **few calls** (batches, one-call checks and finishes) and with **full scripting power** when the
tools aren't enough. The [README](../README.md) is the short tour; this folder is the source of truth.

> Status: **0.1 released** (2026-11-23): npm `chandelier-mcp`, Claude Code plugin, Claude Desktop bundle; macOS.
> Next: Windows as 0.2. See the [roadmap](roadmap.md).

## Use it

| Doc | What's in it |
|-----|--------------|
| [agent-guide.md](agent-guide.md) | How an AI agent should use Chandelier: build, compare with a reference, check, export, recover; `AIA.*` helper reference |
| [brand.md](brand.md) | Logo, colours, type, files and how to use them |

## How it's built and where it's going

| Doc | What's in it |
|-----|--------------|
| [plan.md](plan.md) | Goals, principles, architecture, decisions with **pros and cons**, tool catalogue, risks, testing |
| [roadmap.md](roadmap.md) | Phases, milestones (MVP ✅, 0.1 release), checkboxes, exit criteria, change log |
| [windows-plan.md](windows-plan.md) | The Windows version: bridge options, COM details, steps W0–W8, risks, decisions |
| [logo-plan.md](logo-plan.md) | How the logo and GitHub hero were designed through Chandelier, and what that job found |

## Research and measurements

| Doc | What's in it |
|-----|--------------|
| [research/benchmarks.md](research/benchmarks.md) | Every measurement: per-call latency, the calendar and design-from-image agent benchmarks, targets |
| [research/illustrator-quirks.md](research/illustrator-quirks.md) | Known Illustrator 29.x failures and how Chandelier handles each one |
| [research/feature-gaps.md](research/feature-gaps.md) | Missing tools, user needs, all known competitors with pros and cons, proposed order for 0.1.x–0.4 (2026-11-23) |
| [research/competitors.md](research/competitors.md) | `ie3jp/illustrator-mcp-server` and Adobe's official MCP (beta): what they do, tool parity map |
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
