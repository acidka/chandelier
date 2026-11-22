# Competitors

Update 2026-11-23: four more community servers (Joystiick, jinkeda, gherardo200-glitch, kahrcitect), Adobe's AI Assistant and its local MCP preview (MAX 2026, private beta early 2027) are compared in [feature-gaps.md](feature-gaps.md).

Researched 2026-11-22.

## 1. `ie3jp/illustrator-mcp-server` (independent, MIT)

- Repo: <https://github.com/ie3jp/illustrator-mcp-server>
- Version: npm/latest **1.14.0** (2026-11-11). The owner's setup runs 1.13.0.
- 66 tools, macOS (osascript) and Windows (PowerShell COM), ~720 unit tests, MCP registry listing, `.mcpb` bundle.

### How it runs a tool (from `src/executor/jsx-runner.ts`, `file-transport.ts`)

Per call:
1. Write 4 temp files: params JSON, the JSX, an AppleScript runner, and later the result.
2. Spawn `osascript <runner.scpt>`. That compiles AppleScript and loads Illustrator's scripting dictionary.
3. Illustrator parses `common.jsx` (**1 220 lines** of helpers) + the tool script.
4. The JSX reads params from a file and writes the result to a file; Node reads it and deletes the files.
5. A `p-limit(1)` queue serialises all calls.

Result: **~366 ms median per call** even for a trivial read ([benchmarks](benchmarks.md)). Responses are
pretty-printed JSON (`indent 2`), which costs extra tokens on every call.

### Strengths (worth learning from)
- Broad feature list, including prepress (separations, overprint, trap strokes, crop marks).
- Many edge-case fixes and tests (e.g. MRAP recovery in 1.13, nested-ternary test).
- Windows support.
- Clear error messages for AppleEvent errors (-1712, -2741).

### Weaknesses
| Weakness | Effect |
|----------|--------|
| Process spawn + helper parse per call | ~366 ms/call; slow multi-step work |
| No batching; one object per call | 365 calls for a 12-page calendar (owner's benchmark) |
| Text uses plain CMYK only; no paragraph styles; no global swatches; no bleed on new documents | Files aren't real print templates |
| Coordinate conventions differ between tools (A7, A9) | Artboards land in the wrong place |
| Non-atomic text creation (A8) | Orphan objects after errors |
| No activation before save/export (A10) | Hangs when Illustrator is in the background |
| PDF bleed ignored (A1), false spot colours (A2), non-printing layers checked (A3) | Print checks unreliable |
| **Maintenance pace** | Our PRs #59–61 open since 2026-11-11, no review yet. Upstream merges in batches: PRs from early Sept merged 2026-09-25; a dependabot PR from 2026-09-29 merged 2026-11-10 (6 weeks) |

## 2. Adobe's official Illustrator MCP (beta)

Source: Adobe Help, "Connect Adobe Illustrator (Beta) to AI tools" and "Work with Adobe Illustrator (Beta) documents
from AI tools" (helpx.adobe.com, updated 2026-04-28).

- Only in **Illustrator (Beta)**, not the stable app the owner uses (29.1). Set up from the beta's *MCP & Tools* menu;
  a per-installation auth key.
- Clients named: Cursor, Claude Code, Codex.
- Capabilities (per the help page): documents and artboards (create, open, list, switch, manage artboards);
  inspection (size, position, colours, typography, preview images); layers and groups (create, move into, stacking
  order, clipping masks); selection and transforms (select, move, scale, rotate, align, space); art and text
  (duplicate, delete, rename, **simple** text edits, appearance); export (PNG, JPEG, SVG, PDF).
- **Every change is proposed and must be accepted** in Illustrator — safe, but slow for building documents.
- Not documented: raw tool schemas, scripting/escape hatch, styles, swatches, prepress, GA date.

**Why it's not enough:** beta app only, no scripting escape hatch, no print features, approval click per change.
**What to watch:** when it reaches the stable app, re-check its tool list and speed, and add it to the benchmark.

## 3. Platform outlook

- **CEP** panels still work in Illustrator 2025; no end date announced for Illustrator.
- **UXP** for Illustrator: Adobe's migration page lists a private beta by MAX 2026, **public beta Q2 2027**, GA Q4 2027.
  Third parties can't build Illustrator UXP plugins yet.
- **ExtendScript via Apple Events** (what we and the competitor use) remains the supported scripting path today.

## Tool parity map

Competitor tool → our tool (see [plan §6](../plan.md#6-tool-catalogue)). Status: ✅ done, ⏳ planned, 🧊 later, ➖ covered differently. **After phase 2 (2026-11-22) every core competitor tool has an equivalent**; prepress (P3) and recipes remain.

| Competitor | Ours | Status |
|-----------|------|--------|
| `get_document_info` | `document_info` | ✅ P1 |
| `get_document_structure`, `get_layers`, `get_groups` | `get_tree`, `layers list` | ✅ P1/P2 |
| `get_artboards` | `artboards list` | ✅ P2 |
| `get_selection`, `select_objects` | `selection` | ✅ P1 |
| `find_objects`, `get_path_items`, `list_text_frames`, `get_images` | `find_items` (type filter) | ✅ P1 |
| `get_text_frame_detail` | `get_items` | ✅ P1 |
| `get_colors`, `manage_swatches`, `replace_color` | `swatches`, `modify_items` (bulk recolour via `find_items` + refs) | ✅ P2 |
| `get_effects` | `get_items` (opacity, blend; live effects aren't readable from scripts) | ✅ P1 |
| `get_symbols`, `place_symbol` | `symbols` | 🧊 P4 |
| `get_guidelines` | `find_items {guides: true}` | ✅ P3 |
| `list_fonts` | `fonts` | ✅ P2 |
| `list_text_styles`, `apply_text_style` | `styles` | ✅ P2 |
| `list_graphic_styles`, `apply_graphic_style` | `styles` | ✅ P2 |
| `get_overprint_info`, `get_separation_info` | `preflight` / `document_info` | ✅ P3 |
| `extract_design_tokens` | `run_script` recipe / later tool | 🧊 |
| `check_contrast`, `check_text_consistency` | not planned as tools (`run_script` recipes) | 🧊 |
| `convert_coordinate` | ➖ not needed: one convention everywhere | ➖ |
| `create_document`, `open_document`, `save_document`, `close_document` | `documents` | ✅ P1 |
| `create_rectangle`, `create_ellipse`, `create_line` | `create_shape` | ✅ P2 |
| `create_path` | `create_path` (+ SVG `d`) | ✅ P2 |
| `create_text_frame`, `create_path_text` | `create_text` | ✅ P2 |
| `create_gradient` | `swatches` (gradients) | ✅ P2 |
| `modify_object` | `modify_items` | ✅ P2 |
| `duplicate_objects` | `duplicate_items` | ✅ P2 |
| `delete_objects` | `delete_items` | ✅ P2 |
| `group_objects`, `ungroup_objects`, `set_z_order`, `move_to_layer` | `arrange_items` | ✅ P2 |
| `align_objects` | `align_items` | ✅ P2 |
| `convert_to_outlines` | `path_ops` | ✅ P2 |
| `manage_layers` | `layers` | ✅ P2 |
| `manage_artboards`, `resize_for_variation` | `artboards` (+ `transform_items` scale) | ✅ P2 |
| `place_image`, `manage_linked_images` | `place`, `find_items {type: placed}` | ✅ P2 |
| `import_svg_as_editable` | `place` (SVG markup) | ✅ P2 |
| `undo` | `history` | ✅ P2 |
| `export`, `export_pdf` | `export` | ✅ P3 |
| `preflight_check` | `preflight` | ✅ P3 |
| `create_crop_marks`, `make_trap_stroke`, `toggle_prepress_view` | `artboards {action:"crop_marks"}`; trap stroke and prepress view: `menu_command` / `run_script` | ✅ / 🧊 |
| `place_color_chips`, `place_style_guide` | `run_script` recipes | 🧊 |
| `manage_datasets` | variables/datasets | 🧊 P7 |
| `set_workflow` | `configure` | ✅ P1 |
| `set_illustrator_version` | `configure {app}` | ⏳ P6 |
| — (none) | **`batch`, `run_script`, `preview` (region/items), `duplicate_items` to artboards, `transform_items` step-and-repeat, `styles create`, global swatches, bleed, SVG path data, `path_ops` Pathfinder** | ✅ ours only |
