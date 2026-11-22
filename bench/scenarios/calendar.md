# Macro scenario: 12-month calendar from one screenshot

Agent-level benchmark (phase 4 exit): the job the owner timed on 2026-11-21 with an ExtendScript file (2.7 min,
17 calls, 0.94 M input tokens) and with ie3 MCP calls only (21.4 min, 365 calls, 13.3 M). Protocol, arms and
metrics: [docs/research/benchmarks.md § 2](../../docs/research/benchmarks.md#2-macro-benchmark-agent-level).

**Reference:** [`calendar-reference.png`](calendar-reference.png) (1491 × 1055 px, A4 landscape ratio 1.413):
the January 2027 page of a wall calendar. The grey block on the left is the page's photo area: the original
mock-up had a product photo there, removed from this copy. The reference has a mistake to fix: "0" in empty
cells of the mini month.

What's on a page: month name and year (bold navy, year right-aligned) over a navy rule; a week-number column
("Тиждень", grey numbers) and Пн…Нд headers with Сб/Нд in red; the month's dates Monday-first, weekends red,
thin grey rules between week rows; below, mini calendars of the previous and next month with navy titles and
rules and bold red weekends, split by a thin grey vertical line.

## Prompt (give it verbatim)

> Recreate the calendar in `bench/scenarios/calendar-reference.png` in Adobe Illustrator as one CMYK document
> with 12 A4 landscape artboards, one per month of 2027, named `01_Січень` … `12_Грудень`. Each page has the
> month and year, the week-number column with ISO week numbers, weekday headers, the month's dates (Monday
> first), weekends in red, and mini calendars of the previous and next month (January shows December 2026 and
> February 2027; December shows November 2027 and January 2028). The grey area on the left is a photo area:
> leave it empty. Use live, editable text, global swatches and paragraph styles, and a 3 mm bleed. Fix obvious
> mistakes in the reference. Keep the layout, colours, font weights and sizes as close to the reference as you
> can. Save the document as `<run folder>/calendar-2027.ai` and a PNG preview of January next to it, and compare
> it with the reference.

## Quality checklist (same for every arm)

| # | Check | Pass when |
|---|-------|-----------|
| K1 | Document | CMYK; 12 artboards 841.89 × 595.28 pt (±1); named `01_Січень` … `12_Грудень`; bleed 3 mm (`document_info` bleed ≈ 8.5 pt) |
| K2 | No shortcuts | No raster, placed image or outlined text |
| K3 | Titles | Every page: the right Ukrainian month name and 2027; mini titles right (incl. "Грудень 2026" and "Січень 2028") |
| K4 | Dates | Every month starts on the right weekday and has the right number of days; no "0" in empty cells |
| K5 | Week numbers | ISO 8601 on every page (January: 53, 1, 2, 3, 4; December: 48–52) |
| K6 | Colours | Navy titles and rules, red Сб/Нд and weekend dates (main and mini), grey week numbers and rules |
| K7 | Typography | Bold titles and headers, regular dates, bold mini weekends; sizes follow the reference |
| K8 | Geometry | January's preview matches the reference within ~2 % of page width; photo area empty |
| K9 | Structure | Global swatches and paragraph styles; every text has a paragraph style (`document_info` `unstyledText` 0); named layers or groups |
| K10 | Preflight | 0 errors |

Score: passed checks out of 10.

## Arms (Chandelier)

- **C1** — `chandelier` typed tools + `batch`, no `run_script`.
- **C2** — all `chandelier` tools.

Each run is a fresh sub-agent with the verbatim prompt; it may load whichever chandelier tools it needs (the
server's instructions are its only guide). Run arms one at a time: they share one Illustrator. Results go to
`bench/results/calendar/<run>/` (PNG + `metrics.json` committed, `.ai` not).

**Phase 4 exit:** each arm (one run) ≤ 20 tool calls, ≤ 3 min, ≤ 1.5 M input tokens.
