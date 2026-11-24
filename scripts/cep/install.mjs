#!/usr/bin/env node
// Dev install of the Chandelier panel (phase 8): the same as `npx chandelier-mcp install-panel`, from this checkout.
//   node scripts/cep/install.mjs [--link] [--debug] [--uninstall]   (run "npm run build" first; see src/install-panel.ts)
import { installPanel } from '../../dist/install-panel.js';
process.exitCode = installPanel({ args: process.argv.slice(2) });
