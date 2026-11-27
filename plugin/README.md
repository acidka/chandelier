# Chandelier for Claude

Work in **Adobe Illustrator** from Claude: build print-ready documents, edit them, look at the result and export.
Chandelier keeps one persistent connection to the Illustrator you already have running (~5 ms per call), so a whole
page is built in one call, with global swatches, paragraph styles and a real bleed. macOS and Windows, Illustrator
2025 or later; Node.js 22.15 or later.

## What's in the plugin

- **The Chandelier MCP server** — 36 tools: documents, text, shapes, paths, layers, swatches, styles, effects,
  `batch` (many steps in one call), `run_script` (ExtendScript with a helper library), `preview` (renders and compares
  with a reference image), `preflight`, PDF/X and image export, data merge, and `scene` (an image turned into editable
  vector shapes).
- **The Illustrator skill** — the short build loop, recreating a design from an image, print checks, recovery.
- **Commands** — `/ai-preview` (show the active document and a short preflight) and `/ai-preflight` (preflight for
  print and explain what to fix).

## What it runs, reads and sends

- **Start:** `node launch.mjs` (in this folder) runs `npx -y --prefix <this folder> --package chandelier-mcp@<version>
  chandelier-mcp`, so npm downloads the open-source [`chandelier-mcp`](https://www.npmjs.com/package/chandelier-mcp)
  package once at that exact version and runs it on your computer. That download is the plugin's only network access.
- **Illustrator:** on macOS through Apple events (`osascript`; macOS asks once whether your app may control
  Illustrator); on Windows through a PowerShell process and Illustrator's COM interface, with a small helper compiled
  once into `%LOCALAPPDATA%\chandelier\`. It never starts Illustrator unless you ask, and it changes only documents it
  created or that you asked it to change.
- **Files:** it reads and writes only the paths a request names (documents, exports, placed images, reference
  images), plus renders in a temporary folder; on macOS it converts HEIC, TIFF or WebP images with the system's
  `sips` before reading them. Colour profiles are read from the system's profile folders for PDF/X
  output intents.
- **No data leaves your computer.** No telemetry, no accounts, no API keys. A debug log is written only if you set
  `CHANDELIER_LOG`.

## Source and help

Source, documentation and issues: <https://github.com/acidka/chandelier> (MIT). Adobe and Illustrator are trademarks
of Adobe Inc.; this project is not affiliated with or endorsed by Adobe.
