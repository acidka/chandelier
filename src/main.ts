// The MCP server over stdio (started by index.ts once the Node version is checked).
import { rmSync } from 'node:fs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const { server, ctx } = createServer();
const shutdown = () => { ctx.T.stop(); rmSync(ctx.tmp, { recursive: true, force: true }); process.exit(0); };
process.stdin.on('end', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
await server.connect(new StdioServerTransport());
