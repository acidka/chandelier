# Feature gaps, user needs and competitors

Researched 2026-11-23 against Chandelier 0.1.1 (macOS). Sources at the end; Adobe's help page on the Beta MCP
refused automated reads (HTTP 403), so its facts come from [competitors.md](competitors.md) (2026-11-22).
Demand levels are a judgement: no source ranks Illustrator automation requests by volume.

## Summary

Chandelier is the fastest and most complete Illustrator MCP for print work, but users will hit three gaps first:
**no Windows, no data merge, no multi-file jobs**. Adobe is the competitor that matters: its in-app AI Assistant
(public beta) already makes versioned files from spreadsheet data and runs preflight, and a local Illustrator MCP
was previewed at MAX 2026 for private beta in early 2027.

## Competitors

### Adobe (first party)

| Product | Status | Pros | Cons |
|---------|--------|------|------|
| Illustrator (Beta) MCP | Beta app only; about 40 tools and actions | Official, no install; Cursor, Claude Code, Codex; free (the AI client bills) | Beta app only; every change must be accepted; simple text only; no styles, swatches, prepress or scripting escape hatch |
| Local MCP for Photoshop, Illustrator, Premiere, After Effects | Preview at MAX 2026; private beta early 2027 | Claude, ChatGPT, Gemini shown on stage; demo prepared artwork for screen printing; layers stay editable | Not shipped; tool list, speed and approval model unknown |
| AI Assistant (Creative Agent) in Illustrator | Public beta since 2026-06 | In the app; versioned files from spreadsheet data; preflight; Plan Mode shows the plan first | Adobe's agent only; no reproducible scripts; Firefly credits and plan limits |

### Community Illustrator MCP servers

| Server | Platform, transport | Size | Pros | Cons |
|--------|---------------------|------|------|------|
| ie3jp/illustrator-mcp-server | macOS osascript, Windows PowerShell COM; TS | 66 tools, 240 stars, npm 1.14.0 | Broadest prepress (PDF/X preflight, separations, overprint, trap, crop marks); data sets; WCAG contrast; design tokens; Windows; plugin + .mcpb | ~366 ms per call; no batch or script escape hatch; no paragraph styles or global swatches; Windows untested on hardware; slow PR review |
| Joystiick/illustrator-mcp-server | Same as ie3jp | 63 tools + catalog of up to 500 generated tools | execute_script, annotated preview for vision models, path booleans, SVG import, recipes | One commit, 0 stars; mostly a copy of ie3jp; a 500-tool catalog bloats context |
| jinkeda/Illustrator_MCP | CEP panel + WebSocket; Python | 15 tools | Fast panel transport; job coordinator with recovery; doctor diagnostics; Python SDK | Self-described alpha; complex install (venv, panel build); panel must be open |
| gherardo200-glitch/illustrator-mcp | macOS osascript, Windows COM; TS; optional HTTP | 29 tools | Image vectorize (VTracer or Image Trace); run_script; ChatGPT via tunnel | No pathfinder, effects, swatches, prepress; clone-and-build install |
| kahrcitect/illustrator-mcp | Windows COM; Python | 6 tools | Minimal run_jsx + PNG preview loop; pins the Illustrator version | Windows only; no structured tools |

### Adjacent (other vector apps)

| Tool | Why it matters |
|------|----------------|
| Figma official MCP, Figma Console MCP | Set user expectations: hosted, design tokens, code-to-canvas; UI design rather than print |
| Penpot MCP | Five tools + a JavaScript runtime: the same "small tool list + script" bet as Chandelier |
| Inkscape MCPs (inkscape-mcp, inksmcp) | Free, cross-platform SVG; CLI driven; weak on print (CMYK, PDF/X) |
| Affinity MCPs (szgk, sekharmalla) | Early; no scripting API, so they rely on UI scripting |

## Feature matrix

| Capability | Chandelier 0.1.1 | ie3jp 1.14 | Adobe Beta MCP | Adobe AI Assistant | gherardo200 | jinkeda |
|------------|------------------|------------|----------------|--------------------|-------------|---------|
| Per-call overhead | ~5 ms | ~366 ms | unknown | in-app | osascript per call | WebSocket |
| Batch many steps in one call | yes | no | no | n/a | no | yes |
| Scripting escape hatch | run_script + AIA | no | no | no | run_script | execute_script |
| Preview image to the agent | yes, reference compare | no | yes | n/a | export only | yes |
| Global swatches, paragraph/character styles | yes | no | no | unknown | no | via script |
| Pathfinder, offset, outline | yes | outlines only | no | unknown | no | path_boolean |
| Preflight | yes | yes, PDF/X profiles | no | yes | no | yes |
| PDF Trim/Bleed boxes | yes | broken (A1) | unknown | unknown | no | unknown |
| Separations, overprint, trap | preflight; trap via script | yes | no | unknown | no | no |
| Data merge / variables | no | manage_datasets | no | spreadsheet variations | no | no |
| Symbols | no | yes | no | unknown | no | no |
| Image trace / vectorize | no (menu_command) | no | no | unknown | yes | no |
| Contrast, text consistency, design tokens | no | yes | no | unknown | no | no |
| Windows | no (0.2) | yes, untested | yes | yes | yes | yes |
| Approval per change | no | no | yes | Plan Mode | no | no |

## Missing tools and what users ask for

Demand signals: competitor tool lists, Adobe's assistant tasks, Adobe forum threads on batch recolor, per-layer
output variants and prepress automation.

| # | Tool or feature | Who asks | Demand | Effort | Pros | Cons |
|---|-----------------|----------|--------|--------|------|------|
| 1 | Windows support (0.2) | Windows designers; all competitors have it | High | High | Doubles the market; parity | COM bridge, paths, localisation, second CI; ARM VM may differ from x64 users |
| 2 | data_merge: CSV/JSON rows → variations (variables + data sets, or template per row) | Print shops, labels, badges, certificates; Adobe Assistant headline | High | Medium | Matches Adobe's showcase; one call per job; fits batch | Variables API is clunky; image variables need linked files; big runs may hit timeouts |
| 3 | Multi-file jobs: a step list over a folder (open, change, export, close) | Production teams | High | Medium | Replaces Actions + Batch | Touches files the agent didn't create: opt-in + dry run |
| 4 | Recolor: map colours to a swatch library by tolerance, across items or files | Brand, merch | Medium | Medium | Recolor Artwork has no script API | Gradients, patterns, symbols, raster need special cases |
| 5 | Layer variants export (with/without dieline, per-language layers) | Packaging, multilingual print | Medium | Low | Small option on export | Overlaps run_script recipes |
| 6 | Symbols: list, create, place, replace, edit | Icon sets, maps | Medium | Low–Medium | Already planned; parity | Limited editing API; uuids change on reopen |
| 7 | Image trace / vectorize (tracing via script, optional VTracer) | Logo cleanup, sketch → vector | Medium | Low | Scriptable | Presets per image type; slow on big rasters |
| 8 | Live effects via LiveEffect XML | UI, social, mockups | Medium | Medium | Removes a big "can't" | XML undocumented; effects unreadable from scripts |
| 9 | Checks: WCAG contrast, text consistency, brand tokens | Brand, accessibility | Medium | Low | Built on find_items; parity | Schema size → make them preflight options |
| 10 | Prepress extras: separations preview, trap stroke, PDF/X output intents, profile conversion | Prepress, screen printing | Medium | Medium | Strengthens the print niche Adobe now targets | Colour conversion not scriptable; separations preview is UI-only |
| 11 | Asset export for screens (per item, 1x/2x/3x, naming) | UI, icon designers | Medium | Low | Uses existing export | Figma owns most UI work |
| 12 | Visual diff vs reference | Rebuild-from-image jobs | Medium | Medium | Fewer check loops; unique | Pure-JS image maths; anti-aliasing noise |
| 13 | Session recording → reproducible .jsx | Teams that rerun jobs | Low–Medium | Medium | Unique | Refs must become names |
| 14 | Recipe library (calendars, labels, business cards, style guides, colour chips) | First-time users | Medium | Low | Fewer tokens and errors | Maintenance |
| 15 | Graphs from data | Reports, infographics | Low | Medium | Common in brochures | Graph objects barely scriptable; build from paths |
| 16 | Events through a CEP panel | Interactive pairing | Low | High | Agent reacts to the designer | Extension install; CEP legacy before UXP |
| 17 | Safe restart, debug logs | Long sessions (MRAP) | Medium | Low | Already planned (phase 5) | — |

## Recommended order

Quick wins (high impact, low effort): 5, 6, 7, 9, 11, 14, 17. Big bets: 1, 2, 3, 4, 8, 10, 12. Later: 13, 15, 16.

1. **0.1.x patches (December 2026):** 17, 14, 9 (as preflight options), 5 and 11 (as export options).
2. **0.2 Windows:** 1, plus 6 and 7 (small, and they exercise the new bridge).
3. **0.3 production automation:** 2, 3, 4 — Adobe Assistant's headline task, with any agent. ❓ Owner: swap with 0.2 so data merge lands before Adobe's local MCP beta?
4. **0.4 look and print depth:** 8, 10, 12.
5. **Later, on request:** 13, 15, 16; revisit UXP at its public beta (planned Q2 2027).

## Risks

| Risk | Effect | Mitigation |
|------|--------|------------|
| Adobe's local MCP ships free in the stable app | Basic tasks become commodity | Compete on speed, batching, print correctness, run_script; benchmark it when it ships (roadmap Arm D) |
| Tool list grows past the schema budget | More tokens every turn | Actions/options on existing tools first; `scripts/schema-size.mjs` each release |
| Windows takes longer than planned | 0.3 slips behind Adobe | Data merge is platform-neutral runtime code; run in parallel |
| Multi-file jobs touch user files | Data loss | Opt-in folder, dry run, never overwrite originals by default |
| ExtendScript / Apple Events deprecated after UXP GA (planned Q4 2027) | Bridge stops working | Keep the `Transport` interface; prototype UXP in its beta |
| ie3jp closes the speed gap | Main differentiator shrinks | Keep publishing benchmarks; batching and styles are design choices |

## Sources (opened 2026-11-23)

- <https://github.com/ie3jp/illustrator-mcp-server>
- <https://github.com/Joystiick/illustrator-mcp-server>
- <https://github.com/jinkeda/Illustrator_MCP>
- <https://github.com/gherardo200-glitch/illustrator-mcp>, listing <https://uichemy.com/design-mcps/illustrator-mcp/>
- <https://github.com/kahrcitect/illustrator-mcp>
- Adobe blog, creative agent in Creative Cloud apps (2026-06-18): <https://blog.adobe.com/en/publish/2026/06/18/more-time-spend-on-your-craft-adobe-brings-power-creative-agent-creative-cloud-apps>
- JUST Creative, Adobe MAX 2026 (2026-11-12): <https://justcreative.com/adobe-max-2026-announcements-designers/>
- Jade Agard, Adobe MAX 2026 (2026-11-12): <https://jadeagarddesign.com/adobe-max-2026-announcements/>
- Adobe forum: [batch recolor](https://community.adobe.com/questions-652/automating-recolor-artwork-778607), [outputs per layer](https://community.adobe.com/t5/illustrator-discussions/producing-3-different-files-from-1-artwork-based-on-layers/m-p/12747863/highlight/true), [prepress automation](https://community.adobe.com/t5/illustrator-discussions/automating-prepress-file-prep-tasks/m-p/1170342)
- Search listings only (not opened): inkscape-mcp, inksmcp, mcp-affinity-designer, affinity-mcp-server, Figma MCP docs, Penpot MCP write-up
