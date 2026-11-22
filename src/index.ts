#!/usr/bin/env node
// chandelier — MCP server for Adobe Illustrator, over stdio.
// Checks the Node version first: an MCP client starts the server with whatever `node` is on its PATH (e.g. an old
// nvm default), and on old Node the server would fail later in confusing ways. Too old → a minimal MCP server that
// tells the agent what is wrong and how to fix it (old-node.ts uses only old syntax and no dependencies).
const MIN = [22, 15];
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj > MIN[0] || (maj === MIN[0] && min >= MIN[1])) await import('./main.js');
else await import('./old-node.js');
