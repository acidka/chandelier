# Macro scenario M2 — Recreate design in Illustrator by image

Agent-level benchmark: the agent gets one raster image and must rebuild it as an editable vector Illustrator
document. Tests image reading, layout measuring, typography, colour, and how many calls and tokens each arm needs.
Protocol, arms and metrics: [docs/research/benchmarks.md § 2](../../docs/research/benchmarks.md#2-macro-benchmark-agent-level).

**Reference image:** [`design-from-image.jpg`](design-from-image.jpg) (1220 × 1291 px; the white page is about
1140 × 1275 px, ratio ≈ 0.894, on a grey background).

What's in it: a one-page wall calendar in Ukrainian for **January 2027 (Січень 2027)**:
- Header: "Січень" on the left, "2027" on the right, bold navy, a navy rule under it.
- Main grid: a "Тиждень" (week) column plus Пн…Нд. ISO week numbers 53, 1, 2, 3, 4 in grey. Dates in large black
  type, Сб/Нд headers and weekend dates in red. Thin grey rules between the week rows.
- Footer: two mini months, "Грудень 2026" and "Лютий 2027". Each has a navy title, a navy rule, and a small grid
  with bold red weekends. A thin grey vertical divider sits between them.

## Prompt (give it verbatim)

> Recreate the design in `bench/scenarios/design-from-image.jpg` in Adobe Illustrator as a new CMYK document with
> one artboard in the same proportions as the white page. Use live, editable text (no outlines, no placed or traced
> image) and keep the layout, colours, font weights and sizes as close to the reference as you can. When done,
> export a PNG preview next to the document and compare it with the reference.

## Quality checklist (same for every arm)

| # | Check | Pass when |
|---|-------|-----------|
| Q1 | Document | CMYK, 1 artboard, width/height ratio 0.894 ± 2 % |
| Q2 | No shortcuts | No placed or embedded raster, no outlined text, no Image Trace result |
| Q3 | Text content | All texts in the reference are there and spelled right (Cyrillic shows, no missing-glyph boxes) |
| Q4 | Dates | January 2027 starts on **Friday**; December 2026 on **Tuesday**; February 2027 on **Monday** (28 days) |
| Q5 | Week numbers | 53, 1, 2, 3, 4 (ISO 8601) |
| Q6 | Colours | Navy title, year, rules and mini titles; red Сб/Нд headers and weekend dates; grey week numbers and row rules; black weekdays |
| Q7 | Typography | Bold sans for title, year and headers; regular for main dates; bold for mini weekends; sizes follow the reference hierarchy |
| Q8 | Geometry | Exported preview matches the reference within ~2 % of page width on: title baseline, grid columns, row rules, mini-month blocks, divider |
| Q9 | Structure | Named groups or layers (header, main grid, mini months); no orphan or empty objects |
| Q10 | Preflight | No missing fonts, no RGB objects in the CMYK document |

Score: passed checks out of 10. Record it with the metrics from `bench/macro-metrics.mjs`.

## Recording a run

```sh
# note start/end time of the agent's work, then:
node bench/macro-metrics.mjs ~/.claude*/projects/<dir>/<session>.jsonl \
  --since=<start ISO> --until=<end ISO> --label=M2-C2
```

Add the result row (arm, wall time, model requests, tool calls, input/output tokens, errors, quality score) to
[docs/research/benchmarks.md](../../docs/research/benchmarks.md#macro-scenario-m2--recreate-design-by-image).
