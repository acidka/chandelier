// Builds the MCP server: one McpServer, tools from src/tools, a shared context (transport + runtime).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { mkdtempSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transport } from './transport/transport.js';
import { Runtime } from './runtime.js';
import { TOOLS } from './tools/index.js';
import { fail, ArgError, type Ctx, type ToolDef } from './tools/types.js';
import { respond, runStep } from './tools/respond.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { VERSION } from './version.js';
import { defaultSettings } from './settings.js';
import { profile, toolsTool } from './tools/tools_meta.js';

export const INSTRUCTIONS = `chandelier drives Adobe Illustrator on this Mac (~5 ms per call).
Conventions: coordinates [x, y, w, h] from the top-left of the active artboard, y down, in points (configure: units mm/in/px, origin, artboard). Colours "cmyk(100,85,30,25)", "gray(60)", "#1e2a44", "swatch:Name", "swatch:Name@50", "gradient:Name@45", "none". Refs (one or a list): uuid, "selection", "name:Glob*", "layer:Name", "artboard:N", "@n" (an earlier batch step). Uuids change when a document is reopened.
Load only the tools a job needs (a build: documents, batch or run_script, preview). Fonts match fuzzily; call fonts only when unsure.
Build a document (aim for ~8 Illustrator calls; no status call first):
1. documents new (size, units — they become the session units, bleed, artboards, artboard_names, title).
2. One batch: swatches (global, one per colour role) + styles (one paragraph style per text role); give every text its paragraph_style, so the file can be restyled.
3. One batch of create_text / create_shape / create_path with items[] or grid (many objects per step; step artboard for other pages), duplicate_items to_artboards for repeated parts — or one run_script builder (.jsx file + args) when logic is easier in code; start it with AIA.fresh(layer) so a re-run replaces instead of adding.
4. One check call: preview {reference (when rebuilding from an image), more: [other artboards], preflight: true}; fix what content_box, differences and preflight show (one batch), check once more.
5. One finish call: documents save {path, export: [{format, path, …}], close: true}.
Only touch documents you created or were asked to change; close what you created.`;

/** Run one tool: custom run(), or its runtime step. Never throws. */
export async function callTool(tool: ToolDef, args: any, ctx: Ctx): Promise<CallToolResult> {
  const t = performance.now();
  const r = await callToolInner(tool, args, ctx);
  if (LOG) log({ tool: tool.name, ms: Math.round((performance.now() - t) * 10) / 10, ok: !r.isError, error: r.isError ? firstText(r).slice(0, 300) : undefined });
  return r;
}

async function callToolInner(tool: ToolDef, args: any, ctx: Ctx): Promise<CallToolResult> {
  try {
    if (tool.run) return await tool.run(args, ctx);
    if (!tool.step) return fail(`tool ${tool.name} has no implementation`);
    return respond(await runStep(tool, args, ctx));
  } catch (e) {
    return fail(e instanceof ArgError ? e.message : String((e as Error)?.message ?? e));
  }
}

// Debug log (phase 5): CHANDELIER_LOG=debug writes one JSON line per tool call to stderr (MCP clients keep the
// server's stderr in their logs); CHANDELIER_LOG_FILE=<path> appends the lines to that file instead.
const LOG = process.env.CHANDELIER_LOG === 'debug' || !!process.env.CHANDELIER_LOG_FILE;
const firstText = (r: CallToolResult): string => String((r.content?.find((c) => c.type === 'text') as { text?: string } | undefined)?.text ?? '');
function log(entry: Record<string, unknown>): void {
  const line = JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n';
  try {
    if (process.env.CHANDELIER_LOG_FILE) appendFileSync(process.env.CHANDELIER_LOG_FILE, line);
    else process.stderr.write(line);
  } catch { /* logging never breaks a call */ }
}

/**
 * Every request of an agent re-reads the tool list, so trim what the SDK adds to each tool and nobody reads:
 * the JSON-Schema "$schema" URL and "execution" (~3 KB over 32 tools). Wraps the SDK's own tools/list handler.
 */
function slimToolList(server: McpServer): void {
  const handlers = (server.server as unknown as { _requestHandlers?: Map<string, (req: unknown, extra: unknown) => Promise<any>> })._requestHandlers;
  const original = handlers?.get('tools/list');
  if (!handlers || !original) return;
  handlers.set('tools/list', async (req, extra) => {
    const res = await original(req, extra);
    for (const t of res?.tools ?? []) {
      if (t.inputSchema) delete t.inputSchema.$schema;
      delete t.execution;
    }
    return res;
  });
}

/** Ready-made task prompts (MCP prompts) for the two most common jobs. */
function registerPrompts(server: McpServer): void {
  server.registerPrompt('recreate_design', {
    title: 'Recreate a design from an image',
    description: 'Rebuild a flat design (poster, calendar, price list…) from a screenshot or photo as an editable, print-ready Illustrator file.',
    argsSchema: { image: z.string().describe('path of the image'), output: z.string().describe('path of the .ai to save'), notes: z.string().optional() },
  }, ({ image, output, notes }) => ({ messages: [{ role: 'user', content: { type: 'text', text:
`Recreate the design in ${image} in Illustrator as an editable CMYK document and save it as ${output}.
1. Look at the image. Find the page format from its aspect ratio (1.414 A-series, 1.294 US Letter, 1.25 8×10 in, 1.0 square) and note the page's pixel box.
2. List the parts (titles, rules, grids, repeated blocks, photo areas) and the colour and text roles. Copy the structure, not the artwork: leave photos, logos and brand names out (named placeholder boxes instead) and fix obvious mistakes in the reference.
3. Measure in image pixels and convert with one factor (page width in points ÷ page width in pixels). Font size ≈ cap height in px ÷ 0.7 × factor.
4. documents new; one batch of global swatches (one per colour role) and paragraph styles (one per text role); then build with batches (items[] / grid) or one run_script builder. Every text gets its paragraph style; name layers and groups.
5. preview {reference: "${image}", reference_crop: the page's pixel box, preflight: true}; fix what content_box and differences show (each: kind shifted/missing/extra/changed, shift, items) and what preflight shows; compare once more.
6. documents save {path: "${output}", close: true}. Report what differs from the reference and why.${notes ? '\nNotes: ' + notes : ''}` } }] }));
  server.registerPrompt('print_export', {
    title: 'Print check and export',
    description: 'Preflight the active document, fix what blocks printing, and export a PDF/X-4 with bleed.',
    argsSchema: { output: z.string().describe('path of the PDF'), bleed: z.string().optional().describe('e.g. "3 mm" or "0.125 in"; default: the document bleed') },
  }, ({ output, bleed }) => ({ messages: [{ role: 'user', content: { type: 'text', text:
`Get the active Illustrator document ready for print and export it to ${output}.
1. document_info: note the colour space, artboards and bleed.
2. preflight. Fix every error (missing fonts, RGB images, overset text, white overprint) or explain why it can't be fixed; mention warnings worth a look (low-res images, hairlines, art at the edge without bleed).
3. export {format: "pdf", artboards: "all", path: "${output}"${bleed ? ', bleed: <' + bleed + ' in session units>' : ''}}: PDF/X-4, trim and bleed boxes set.
4. Report the file, its pages and boxes (from the export result) and what preflight found.` } }] }));
}

const LEAN_NOTE = `
More tools than are listed: tools {} (catalog), {query}, {name} (schema), {call, args}; the ones that change items also work as batch steps.`;

export function createServer(opts: { transport?: Transport; tmp?: string; tools?: string } = {}) {
  const T = opts.transport ?? new Transport();
  const settings = defaultSettings();
  const ctx: Ctx = { T, rt: new Runtime(T, settings), tmp: opts.tmp ?? mkdtempSync(join(tmpdir(), 'aia-')), created: new Set(), settings, tools: new Map(TOOLS.map((t) => [t.name, t])) };
  // tool profile (0.3): CHANDELIER_TOOLS=lean or a list of names; the rest behind the "tools" tool
  const shown = profile(opts.tools ?? process.env.CHANDELIER_TOOLS, TOOLS.map((t) => t.name));
  let exposed = TOOLS;
  if (shown) {
    const meta = toolsTool(TOOLS.filter((t) => !shown.includes(t.name)).map((t) => t.name));
    ctx.tools.set(meta.name, meta);
    exposed = [...TOOLS.filter((t) => shown.includes(t.name)), meta];
  }
  const server = new McpServer({ name: 'chandelier', version: VERSION }, { instructions: shown ? INSTRUCTIONS + LEAN_NOTE : INSTRUCTIONS });
  for (const tool of exposed) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.shape }, (args: unknown) => callTool(tool, args ?? {}, ctx));
  }
  registerPrompts(server);
  slimToolList(server);
  return { server, ctx };
}
