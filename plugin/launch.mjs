#!/usr/bin/env node
// Starts the Chandelier MCP server for the Claude Code plugin, on macOS and Windows.
// Why a launcher: Windows has no `npx` executable, only `npx.cmd`, which needs a shell, and a plugin's mcpServers
// entry can't differ per OS. `node` is required on both, so the plugin runs `node launch.mjs` and this file runs npx.
// --prefix keeps npx from resolving this repository's own package when Claude Code runs inside it (quirk C25).
// CHANDELIER_MCP_SPEC overrides the package spec (tests: a packed .tgz).
import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const spec = process.env.CHANDELIER_MCP_SPEC || 'chandelier-mcp@^0.5.0';
// --package + the bin name: works for a registry range and for a .tgz path alike
const args = ['-y', '--prefix', root, '--package', spec, 'chandelier-mcp'];
// Windows: npx.cmd runs through cmd, as ONE command line (separate args with shell:true are deprecated, DEP0190).
// Arguments quoted (cmd would eat the ^ of a version range); the command name not: a batch file started by a quoted
// bare name gets the current folder as its own (%~dp0) and npx then can't find npm.
const child = process.platform === 'win32'
  ? spawn(['npx.cmd', ...args.map((a) => `"${a}"`)].join(' '), { stdio: 'inherit', shell: true })
  : spawn('npx', args, { stdio: 'inherit' });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on('error', (e) => { console.error(`chandelier: could not start npx: ${e.message}`); process.exit(1); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
