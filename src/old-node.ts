// Minimal MCP server for a Node that is too old to run Chandelier: answers initialize and tools/list with one
// `status` tool, and every tool call with the explanation. Plain JSON-RPC over stdio, no dependencies.
import { createInterface } from 'node:readline';

const found = process.versions.node;
const MESSAGE = `Chandelier needs Node.js 22.15 or later, but the MCP client started it with Node ${found} (${process.execPath}). ` +
  'Fix: install a current Node (e.g. `nvm install 22 && nvm alias default 22`, or `brew install node`) and make it the first `node` on the PATH ' +
  'the client starts with, or set the server command to the full path of a newer node. Then restart the MCP client.';
process.stderr.write(MESSAGE + '\n');

function send(msg: unknown): void { process.stdout.write(JSON.stringify(msg) + '\n'); }
createInterface({ input: process.stdin }).on('line', (line) => {
  let req: { id?: number | string; method?: string; params?: { protocolVersion?: string } };
  try { req = JSON.parse(line); } catch (e) { return; }
  if (req.id === undefined || req.id === null) return; // notifications
  if (req.method === 'initialize') {
    send({ jsonrpc: '2.0', id: req.id, result: {
      protocolVersion: (req.params && req.params.protocolVersion) || '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'chandelier', version: 'node-too-old' },
      instructions: MESSAGE,
    } });
  } else if (req.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: req.id, result: { tools: [{ name: 'status', description: 'Chandelier cannot start: ' + MESSAGE, inputSchema: { type: 'object', properties: {} } }] } });
  } else if (req.method === 'tools/call') {
    send({ jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: MESSAGE }], isError: true } });
  } else if (req.method === 'ping') {
    send({ jsonrpc: '2.0', id: req.id, result: {} });
  } else {
    send({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: MESSAGE } });
  }
});
