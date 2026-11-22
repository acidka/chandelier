#!/usr/bin/env node
// Extract agent-level metrics from a Claude Code session transcript (.jsonl) for the macro benchmark.
//
//   node bench/macro-metrics.mjs <session.jsonl> [--since=ISO] [--until=ISO] [--label=C-ours] [--json]
//
// Transcripts live in ~/.claude*/projects/<project-dir>/<session-id>.jsonl.
// Reports: wall time, model requests, input tokens (uncached + cache write + cache read), output tokens,
// tool calls grouped by family (ie3 MCP, our MCP, ExtendScript via Bash/osascript, other), tool errors.

import { readFileSync } from 'node:fs';

const [file, ...rest] = process.argv.slice(2);
if (!file) { console.error('usage: macro-metrics.mjs <session.jsonl> [--since=ISO] [--until=ISO] [--label=name] [--json]'); process.exit(2); }
const opt = Object.fromEntries(rest.map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const since = opt.since ? Date.parse(opt.since) : -Infinity;
const until = opt.until ? Date.parse(opt.until) : Infinity;

const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const inWindow = (l) => { const t = Date.parse(l.timestamp ?? ''); return Number.isFinite(t) && t >= since && t <= until; };

function family(name, input) {
  if (name.startsWith('mcp__illustrator-mcp__')) return 'B ie3 MCP';
  if (name.startsWith('mcp__chandelier__') || name.startsWith('mcp__illustrator-agent__')) return 'C our MCP'; // old name kept for earlier transcripts
  if (name === 'Bash' && /osascript|run\.sh|do javascript/.test(String(input?.command ?? ''))) return 'A ExtendScript (Bash)';
  return 'other';
}

const usageByRequest = new Map();
const toolCalls = new Map(); // tool_use id → {name, family}
const families = {};
const errors = {};
let first = Infinity, last = -Infinity;

for (const l of lines) {
  if (!inWindow(l)) continue;
  const t = Date.parse(l.timestamp);
  if (l.type === 'assistant' && l.message) {
    first = Math.min(first, t); last = Math.max(last, t);
    const key = l.requestId ?? l.message.id ?? l.uuid;
    if (l.message.usage) usageByRequest.set(key, l.message.usage); // one usage per API request (lines repeat it per block)
    for (const c of l.message.content ?? []) {
      if (c.type !== 'tool_use') continue;
      const fam = family(c.name, c.input);
      toolCalls.set(c.id, { name: c.name, family: fam });
      families[fam] = (families[fam] ?? 0) + 1;
    }
  }
  if (l.type === 'user' && Array.isArray(l.message?.content)) {
    last = Math.max(last, t);
    for (const c of l.message.content) {
      if (c.type === 'tool_result' && c.is_error) {
        const fam = toolCalls.get(c.tool_use_id)?.family ?? 'unknown';
        errors[fam] = (errors[fam] ?? 0) + 1;
      }
    }
  }
}

let input = 0, cacheWrite = 0, cacheRead = 0, output = 0;
for (const u of usageByRequest.values()) {
  input += u.input_tokens ?? 0;
  cacheWrite += u.cache_creation_input_tokens ?? 0;
  cacheRead += u.cache_read_input_tokens ?? 0;
  output += u.output_tokens ?? 0;
}
const result = {
  label: opt.label ?? null,
  file,
  window: { from: Number.isFinite(first) ? new Date(first).toISOString() : null, to: Number.isFinite(last) ? new Date(last).toISOString() : null },
  wallMinutes: Number.isFinite(first) ? +((last - first) / 60000).toFixed(1) : 0,
  modelRequests: usageByRequest.size,
  inputTokensTotal: input + cacheWrite + cacheRead,
  inputTokens: { uncached: input, cacheWrite, cacheRead },
  outputTokens: output,
  toolCalls: [...toolCalls.values()].length,
  toolCallsByFamily: families,
  toolErrorsByFamily: errors,
};

if (opt.json) { console.log(JSON.stringify(result, null, 2)); process.exit(0); }
const M = (n) => (n / 1e6).toFixed(2) + ' M';
console.log(`${result.label ? result.label + ' · ' : ''}${result.window.from} → ${result.window.to}`);
console.log(`wall time        ${result.wallMinutes} min`);
console.log(`model requests   ${result.modelRequests}`);
console.log(`input tokens     ${M(result.inputTokensTotal)}  (uncached ${input}, cache write ${cacheWrite}, cache read ${cacheRead})`);
console.log(`output tokens    ${(output / 1000).toFixed(1)} k`);
console.log(`tool calls       ${result.toolCalls}  ${JSON.stringify(families)}`);
console.log(`tool errors      ${JSON.stringify(errors)}`);
