---
description: Preflight the active Illustrator document for print and explain what to fix
argument-hint: "[fix]"
---

Use the chandelier MCP tools to preflight the active Adobe Illustrator document for print.

1. `document_info`, then `preflight`.
2. Report errors first (missing fonts, RGB in CMYK, overset text, broken links, white overprint), then the warnings
   that matter (low-res images, hairlines, art at the edge without bleed, small text), each with the item and what
   to do about it.
3. If `$ARGUMENTS` contains `fix`: fix the errors you can fix safely (e.g. convert RGB colours to CMYK, fit overset
   text), say exactly what you changed, and run `preflight` again. Otherwise change nothing.
