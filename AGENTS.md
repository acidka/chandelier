# Rules for agents working in this repo

## What this is
**Chandelier** (люстра — Ukrainian slang for Illustrator): an MCP server that drives Adobe Illustrator fast: a persistent bridge (JXA `src/bridge/bridge-mac.js` on macOS, PowerShell/COM `src/bridge/bridge-win.ps1` on Windows, picked in `src/platform.ts`), an
ExtendScript runtime loaded once into Illustrator (`src/runtime/core.jsx` + one module per tool family, sent as one source; `$.global.AIA`), ready builders in `src/recipes/` (`run_script {recipe}`), and a
TypeScript MCP server (`src/`, built to `dist/`), an experimental CEP panel for events (`src/cep/`, opt-in `CHANDELIER_TRANSPORT=panel`), packaged for npm (`chandelier-mcp`), as a Claude Code plugin
(`plugin/`) and as a Claude Desktop bundle (`scripts/build-mcpb.mjs`). Plan and decisions: `docs/plan.md`. TODO board: `docs/roadmap.md`.

## Commands
Use Node ≥ 22.15 (if `node` on your PATH is older, run a newer one by its full path).

```sh
npm run build       # tsc + copy bridge/runtime into dist/
npm test            # unit tests (no Illustrator needed)
npm run lint:jsx    # ES3 lint of the runtime and the recipes
npm run typecheck
npm run test:live   # needs a running Illustrator; works only in a document it creates
node test/live-layout.mjs         # multi-artboard spacing/bleed, batch step artboard, AIA.at, non-printing renders
node test/live-finish.mjs         # documents new {units}, preview {more, preflight, info}, documents save {export, close}
node test/live-release.mjs        # 0.1: preview region from an artboard, SVG clipped to the artboard, low_contrast (also in test:live)
node test/live-look.mjs           # 0.4: effects, trap, convert, output intent, preview differences (ONLY=effects|print|diff)
node test/live-production.mjs     # 0.3: data_merge, batch {files}, swatches recolor/import (temp files only)
node test/live-restart.mjs        # quits (Windows: kills mid-call) + relaunches Illustrator (refuses if documents are open)
node test/live-safe-restart.mjs   # status {restart}: refused while unsaved, else relaunch + reopen (refuses if documents are open)
node test/verify-assumptions.mjs  # uuid / undo / 5 000-object scan checks (roadmap 1.6)
npm run bench       # micro benchmark A/B/C
npm run build:mcpb  # Claude Desktop bundle → build/chandelier-<version>.mcpb
scripts/windows/make-x86-vm.sh <iso>  # on the Mac: unattended Windows 10 x64 VM (Parallels x86 emulation) for live tests
scripts/windows/connect-vm.sh     # on the Mac, once: Parallels VM → SSH for the agent (key in tmp/windows-vm/; runs setup-vm.ps1 in the VM)
ssh -F tmp/windows-vm/ssh_config win  # into the Windows VM (docs/windows-plan.md § 11)
node test/live-w1-bridge.mjs      # Windows, desktop session (run-interactive.ps1): bridge latency, script size, Unicode, errors (W1)
node test/live-w1-activate.mjs    # Windows, desktop session: save/export with Illustrator in the background (W1)
scripts/windows/run-interactive.ps1  # over SSH: run a command in the VM's desktop session (live tests need it)
node test/live-scene.mjs           # scene tool: analyze → build → undo/redo → rebuild with hand work → refine (own document)
node bench/scene-bench.mjs <image>  # scene timings and payload; bench/scene-headroom.mjs <image> [crop] [roi]: error per pipeline stage
claude plugin validate plugin     # Claude Code plugin (plugin/: manifest, skill, commands); marketplace in .claude-plugin/
node scripts/schema-size.mjs      # size of the tool list agents re-read on every request (budget: unit test)
node scripts/cep/install.mjs --link  # dev-install the Chandelier panel (CEP) into Illustrator; --debug (DevTools :8098), --uninstall (docs/panel-plan.md)
CHANDELIER_TRANSPORT=panel npm run test:live  # the live suite through the panel (open Window > Extensions > Chandelier first)
claude --dangerously-load-development-channels server:<name>  # with CHANDELIER_CHANNEL=1 on that server: panel chat wakes the session (docs/panel-plan.md)
```

## Rules
- **Docs are always current.** Any change to design, tools or process updates `docs/` in the same commit
  (tick the roadmap item, add a change-log row, keep tool tables in `docs/plan.md` true).
- **The README is the project's face.** When status, numbers, tools or install steps change, update it too; every
  number in it comes from `docs/research/benchmarks.md`.
- **Client files never enter git.** Real jobs, their reference images and outputs live in the git-ignored `tmp/`;
  docs describe them without client names, text or images.
- **Runtime is ES3.** `var` only; no arrows, `let/const`, template strings, trailing commas, `Array#map/forEach/indexOf`,
  `JSON`, `Object.keys`, `String#trim`; bracket nested `?:` (quirk B9). `npm run lint:jsx` must pass.
  Runtime regexes stay ASCII-only (B6); keep the runtime file ASCII (escape as `\uXXXX`).
- **Never read `ParagraphStyle.characterAttributes`** (crashes Illustrator, B1). Write a style's paragraph attributes
  only through the style held in a variable (`var st = …getByName(n); st.paragraphAttributes.x = v`, C24).
- Don't name runtime options `reflect`, `watch`, `unwatch` or `toSource`: every ExtendScript object already has them (C13).
- **Never touch documents you didn't create** in tests or benchmarks; close scratch documents without saving.
- Never auto-launch Illustrator (only `status {launch:true}`).
- Coordinates in every tool: artboard top-left origin, y grows down, session `units` (see `docs/plan.md` D5).
- Measurements in docs carry a date and environment (Illustrator version, macOS, Node).
