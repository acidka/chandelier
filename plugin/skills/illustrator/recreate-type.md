# Recreate: text, layout and grids (§ 3)

Part of the recreate method — the core (every job) is [recreate.md](recreate.md): § 0–2 set up and read the image, § 6 colour, § 8 compare, § 9 finish. This file: § 3, for text, grids, tables, rules and boxes.

## 3. Text, layout and grids

- Measure positions in pixels with `preview {image, region, grid: 10}` and convert with S; snap to the grid the
  design obviously uses (equal columns, a common margin, a baseline step) instead of copying each pixel.
- **Font size ≈ cap height in px ÷ 0.7 × S** (x-height ÷ 0.5 for lowercase text) — a first guess: fonts differ (Futura's
  caps came out 11 % too tall), so confirm the cap height in a close-up and adjust. Weight from stroke thickness
  against the cap height; width from a known word's length.
  - **Measure each large text on its own:** two headings that look alike can differ (one cap height gave 59 pt for
    both; they needed 61 and 54 pt).
  - **Check a display line's width too:** compare the box `create_text` returns with the measured width of the line;
    at the right cap height a title came out ~10 % narrow — fix with the font, `horizontal_scale` or tracking.
- Fonts match fuzzily (`fonts {query}` when unsure). A missing font: the closest installed one, then match widths with
  `horizontal_scale` so lines break where the reference breaks. Body copy goes in area text.
- **Choosing the font:** set the same line in 4–6 candidate fonts in one batch, compare the returned box widths with the
  measured width and look at one render. The x-height : cap-height ratio narrows the family (0.75 → Tahoma/Verdana).
  A JPEG screenshot makes type look heavier than it is: don't pick the weight from the blur.
- A geometric lowercase **wordmark** (circles or ellipses and stems) is faster to construct than to match with fonts:
  measure counters and stems in one zoom, unite the positive shapes, `minus_front` the counters and an arch's cutter.
- **Non-Latin text** (Cyrillic, Greek…): the fuzzy font match doesn't check the script — look at the text in a
  preview close-up; missing glyphs show as boxes or a fallback face. Pick a font that has the script. Faces seen to
  carry Cyrillic on macOS: Helvetica Neue (Light too), Arial, Times New Roman, Montserrat when installed;
  AvenirNext-UltraLight showed boxes. Check the chosen face in a close-up before setting all the text.
- **Wordmark, in this order:** cap height with the size, then one wide letter's width with `horizontal_scale`, then the
  whole word's width with tracking. All at once take several rounds.
- **Centred point text with tracking:** check its position by the box `create_text` / `edit_text` return, or by
  `content_box` in a region preview — not by a formula.
- A paragraph style update doesn't clear tracking set locally by `edit_text`: re-apply the `paragraph_style`.
  Re-applying it clears **every** local override, `align` included (a centred line jumped ~50 mm): put `align`,
  tracking and every other shared setting in the style itself, and set locally only what one frame needs.
- `horizontal_scale` thickens or thins stems along with the width: check the stem weight against the reference after
  scaling, and change the weight if it is off.
- Give every text its paragraph style and every colour its swatch, so the file can be restyled.
- Tables and calendars: `create_text {grid}` with column props; check the content (dates, weekdays, totals) — a
  correct-looking grid with a wrong first weekday is the classic miss.
- Check alignment and spacing in a close-up against the reference: baselines on one line, equal gaps, rules where they
  start and end.
- **Text on a circle** (badges, seals, emblems): a circular path for each arc, `create_text {kind: "path", on_path}`.
  The path's direction decides the side: the top arc runs left → right **over** the top (clockwise from 9 to 3
  o'clock), the bottom arc left → right **through** the bottom (counter-clockwise from 7 to 5 o'clock) so it reads
  upright. The path's radius is the baseline: top arc = ring's centre radius − cap height / 2, bottom arc = centre
  radius + cap height / 2. Size from the angle the text spans: measure the arc length of the reference's text at its
  baseline radius and match it with `horizontal_scale` or tracking, not size.
  - The two arcs may have different sizes, and the ring may not share the disc's centre: measure the ring's own
    centre for the text paths.
  - Match the span by the **angles of the first and last letters** in a close-up; scale tracking by the ratio of the
    spans. `baseline_shift` in the style moves path text in or out radially.
- **Size without capitals** (lowercase-heavy text, x-height dominant): font size ≈ x-height ÷ the font's x-height
  ratio (≈ 0.5; e.g. Source Sans 0.486) × S; cap height ÷ 0.7 only for capitals.
