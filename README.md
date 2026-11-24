<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/hero-dark.svg">
    <img alt="Chandelier — light up Illustrator for AI agents" src="docs/assets/brand/hero-light.svg" width="100%">
  </picture>
</h1>

<p align="center">
  <a href="LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-0F1B2D"></a>
  <img alt="macOS and Windows" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-0F1B2D">
  <img alt="Adobe Illustrator 2025+" src="https://img.shields.io/badge/Illustrator-2025%2B-0F1B2D">
  <img alt="MCP server" src="https://img.shields.io/badge/MCP-server-0F1B2D">
  <a href="https://ko-fi.com/acidka"><img alt="Support on Ko-fi" src="https://img.shields.io/badge/Ko--fi-support-FF5E5B?logo=kofi&logoColor=white"></a>
</p>

**Chandelier** is an [MCP](https://modelcontextprotocol.io) server that lets AI agents — Claude Code, Claude Desktop,
Cursor and other MCP clients — work in **Adobe Illustrator**: build print-ready documents, edit them, look at the
result and export. It keeps **one persistent connection** to Illustrator, so a call costs **~5 ms instead of
~300 ms**, and a whole page is built in **one call**.

> *Chandelier* is *люстра* in Ukrainian, and «люстра» is what Ukrainian designers call Illustrator. A project that
> hangs over Illustrator and lights it up for AI agents.

## Why

Driving Illustrator from an agent used to mean a choice: write ExtendScript files (fast, but blind and fiddly) or
call an MCP server tool by tool (convenient, but hundreds of slow calls). Chandelier is both: typed tools, batches and
a full scripting escape hatch over one fast connection, plus the print features real jobs need.

Measured with fresh Claude agents on the same jobs (2026-11-22, Illustrator 29.1, Apple M1):

| Job | ExtendScript files | [ie3 MCP](https://github.com/ie3jp/illustrator-mcp-server) | **Chandelier** |
|-----|-------------------:|-----------------------:|---------------:|
| **Recreate a design from an image** — time | 2.5 min | 5.0 min | **1.2 min** |
| tool calls · input tokens | 16 · 0.81 M | 103 · 3.21 M | **11 · 0.42 M** |
| **12-page calendar from a screenshot** — time | 2.7 min | 21.4 min | **2.0 min** |
| tool calls · input tokens | 17 · 0.94 M | 365 · 13.3 M | **17 · 0.78 M** |
| **Overhead per call** | ~150 ms | ~280 ms | **~5 ms** |

All Chandelier files scored 9–10 of 10 on the quality checklists, with global swatches, paragraph styles and a real
bleed. Methods, every run and the caveats (one run per arm for the latest numbers): [benchmarks](docs/research/benchmarks.md).

## Features

- **Fast.** One long-lived bridge process and a helper runtime loaded into Illustrator once; each call sends only a
  command and its arguments. `batch` runs up to 1 000 tool steps in one round trip.
- **Full power when tools aren't enough.** `run_script` runs ExtendScript with a helper library (`AIA.text`,
  `AIA.swatch`, `AIA.at(artboard, …)` …) and re-runnable `.jsx` builders with arguments.
- **Print-ready.** CMYK documents with real bleed, global process and spot swatches, paragraph and character styles,
  PDF/X-4 export with exact trim and bleed boxes, and a preflight that checks what matters (RGB in CMYK, missing
  fonts, overset text, hairlines, low-res images, white overprint…) and skips non-printing layers.
- **It looks at its work.** `preview` returns an image of an artboard, items or a region; given a reference image it
  returns a side-by-side difference, how far the content is shifted or scaled, and the regions that differ most.
- **Short build loop.** Create a document, one batch for swatches and styles, one for content, one check
  (`preview {reference, preflight: true}`), one finish (`documents save {export: [...], close: true}`) — about eight
  calls to Illustrator for a page.
- **Safe by design.** Never launches Illustrator unless asked, never touches documents it didn't create or wasn't
  asked to change, removes what a failed call created, retries Illustrator's transient errors, and explains crashes
  and timeouts in plain words.
- **Agent-friendly.** Compact responses with limits, conventions sent once in the server instructions, errors that
  say what to do next, and two ready-made prompts: `recreate_design` and `print_export`.

## What you can ask

> Recreate the poster in `poster.png` as an editable CMYK A3 document with a 3 mm bleed, using global swatches and
> paragraph styles, and export a PDF/X-4.

> Make a 2027 wall calendar: 12 A4 landscape pages, Monday first, ISO week numbers, weekends in red.

> Preflight the open document, fix every error, and tell me what you changed.

> Change the brand colour everywhere to `cmyk(100, 60, 0, 10)` and export PNG previews of every artboard.

## Tools

32 tools; every tool that changes a document can also be a step inside `batch`.

| Group | Tools |
|-------|-------|
| Session and documents | `status` · `configure` · `documents` · `document_info` · `history` |
| Inspect | `find_items` · `get_items` · `get_tree` · `selection` · `fonts` |
| Create | `create_text` · `create_shape` · `create_path` · `place` |
| Edit | `edit_text` · `modify_items` · `transform_items` · `duplicate_items` · `arrange_items` · `align_items` · `path_ops` · `delete_items` |
| Structure and colour | `layers` · `artboards` · `swatches` · `styles` |
| Build | `batch` · `run_script` · `menu_command` |
| Look, check, output | `preview` · `preflight` · `export` |

Coordinates in every tool: `[x, y, w, h]` from the artboard's top-left, y down, in the session's units (pt, mm, in
or px). Full catalogue: [plan § 6](docs/plan.md#6-tool-catalogue); how agents should use them:
[agent guide](docs/agent-guide.md).

## Quick start

**Needs:** macOS or Windows 11, Adobe Illustrator 2025 or later running (tested on 29.1 on macOS, 2027 / 31.0 on
Windows 11 ARM64), and Node.js 22.15 or later for the Claude Code and `npx` routes.

**Claude Code — plugin (recommended).** The MCP server, an Illustrator skill and the `/ai-preview` and
`/ai-preflight` commands:

```
/plugin install chandelier --marketplace acidka/chandelier
```

(On Claude Code older than 2.1.275: `/plugin marketplace add acidka/chandelier`, then `/plugin install chandelier@chandelier`.)

**Claude Code or any MCP client — server only:**

```sh
claude mcp add chandelier -- npx -y chandelier-mcp            # macOS
claude mcp add chandelier -- cmd /c npx -y chandelier-mcp     # Windows
```

or in an MCP config (`.mcp.json`, Cursor…):

```json
{ "mcpServers": { "chandelier": { "command": "npx", "args": ["-y", "chandelier-mcp"] } } }
```

(On Windows: `"command": "cmd", "args": ["/c", "npx", "-y", "chandelier-mcp"]` — Windows has no `npx` executable,
only `npx.cmd`. The plugin and the Claude Desktop bundle handle this themselves.)

**Claude Desktop.** Download `chandelier-<version>.mcpb` from the
[releases](https://github.com/acidka/chandelier/releases) and open it (or **Settings → Extensions → Install
extension**). It brings its own dependencies and runs on Claude Desktop's built-in Node.

**From source** (to develop):

```sh
git clone https://github.com/acidka/chandelier.git && cd chandelier
npm install && npm run build      # then point your client at node /absolute/path/to/chandelier/dist/index.js
```

**macOS:** on the first call macOS asks whether your terminal (or app) may control Illustrator: allow it, or later in
**System Settings → Privacy & Security → Automation**.

**Windows:** nothing to allow. Run Illustrator and your MCP client at the same level (both normal, or both "Run as
administrator"). The first start compiles a small helper (a few seconds); later starts reuse it. Illustrator can't
save or open files whose path is 260 characters or longer: the server refuses those with a message.

**Node version:** the plugin and `npx` start the server with the first `node` on your PATH. If that is older than
22.15 (an old nvm default, for example), the server says so through the `status` tool instead of starting: install a
current Node and make it the default (`nvm install 22 && nvm alias default 22`, or `brew install node`), or give
the full path of a newer `node` as the command, then restart your MCP client.

## How it works

```
AI agent ──MCP (stdio)──▶ Chandelier server (Node.js)
                              │  one persistent bridge process:
                              │  macOS: osascript / JXA (Apple events) · Windows: PowerShell + COM (DoJavaScript)
                              ▼
                          Adobe Illustrator ── AIA runtime (ExtendScript, loaded once per Illustrator session)
```

Each tool call becomes one Apple event (macOS) or COM call (Windows) that runs one runtime command; the runtime
reloads itself after Illustrator restarts. Architecture, decisions with their pros and cons, and the measurements
behind them: [plan](docs/plan.md).

## Status

**0.1 released** (2026-11-23): on npm, as a Claude Code plugin and as a Claude Desktop bundle, macOS.

**0.2: Windows** — the same tools over a PowerShell/COM bridge ([plan](docs/windows-plan.md)): all live suites pass
with Illustrator 2027 on Windows 11 (ARM64, in a Parallels VM); npm package, plugin and Claude Desktop bundle run on
Windows. Release pending.

Everything planned and done: [roadmap](docs/roadmap.md).

## Documentation

| | |
|---|---|
| [Agent guide](docs/agent-guide.md) | How an agent should build, check and export with Chandelier |
| [Plan](docs/plan.md) | Goals, architecture, decisions with pros and cons, tool catalogue, risks |
| [Roadmap](docs/roadmap.md) | Phases, milestones, what's done and what's next |
| [Benchmarks](docs/research/benchmarks.md) | Every measurement, method and run |
| [Illustrator quirks](docs/research/illustrator-quirks.md) | Known Illustrator failures and how Chandelier handles them |
| [All docs](docs/README.md) | The full index |

## Develop

```sh
npm test            # unit tests, no Illustrator needed
npm run lint:jsx    # ES3 lint of the ExtendScript runtime
npm run typecheck
npm run test:live   # live suites: need Illustrator running; work only in documents they create
npm run bench       # micro benchmark (ExtendScript files / ie3 MCP / Chandelier)
npm run build:mcpb  # Claude Desktop bundle in build/
claude plugin validate plugin   # the Claude Code plugin (plugin/) and its marketplace (.claude-plugin/)
```

Rules for contributors and coding agents: [AGENTS.md](AGENTS.md).

## Support

Chandelier is free and open source, built in spare time. If it saves you time in Illustrator, you can buy me a
coffee on Ko-fi:

<a href="https://ko-fi.com/acidka"><img alt="Support me on Ko-fi" src="https://storage.ko-fi.com/cdn/kofi3.png?v=6" height="40"></a>

## Licence

Code: [MIT](LICENSE). The logo and hero images are not covered by the MIT licence: see [brand](docs/brand.md#licence).
Adobe and Illustrator are trademarks of Adobe Inc.; this project is not affiliated with or endorsed by Adobe.
