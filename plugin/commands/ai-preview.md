---
description: Show the active Illustrator document (or one artboard) and a short preflight summary
argument-hint: "[artboard number | all]"
---

Use the chandelier MCP tools to show me the active Adobe Illustrator document.

- If `$ARGUMENTS` is a number, preview that artboard (0-based). If it is `all`, preview the first artboard and pass
  every other artboard in `more`. Otherwise preview the active artboard.
- Use one `preview` call with `preflight: true` and `info: true`.
- Then tell me in a few lines: document name, colour space, artboards, bleed, and preflight errors and warnings
  (counts, plus the most important items). Don't change the document.
