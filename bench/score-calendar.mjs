#!/usr/bin/env node
// Score a calendar benchmark run (bench/scenarios/calendar.md, checks K1, K2, K9, K10 automatically) and save previews
// of January (side-by-side with the reference), July and December for the visual checks K3–K8.
//   npm run build && node bench/score-calendar.mjs <run folder>   (e.g. bench/results/calendar/C1-1)
// Opens the run's calendar-2027.ai, never saves it, closes it again.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = resolve(process.argv[2]);
const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
const c = new Client({ name: 'score', version: '0' });
await c.connect(new StdioClientTransport({ command: process.execPath, args: [join(ROOT, 'dist/index.js')], stderr: 'inherit' }));
const call = async (name, args) => { const r = await c.callTool({ name, arguments: args }); const t = r.content.find((x) => x.type === 'text')?.text ?? ''; if (r.isError) throw new Error(`${name}: ${t}`); try { return JSON.parse(t); } catch { return t; } };

const opened = await call('documents', { action: 'open', path: join(run, 'calendar-2027.ai') });
const out = { run: relative(ROOT, run) };
try {
  const info = await call('document_info', {});
  const ab = info.artboards;
  const names = ab.map((a) => a.name);
  out.K1 = { cmyk: info.colorSpace === 'CMYK', artboards: ab.length, a4_landscape: ab.every((a) => Math.abs(a.rect[2] - 841.89) <= 1 && Math.abs(a.rect[3] - 595.28) <= 1),
    names_ok: names.every((n, i) => n === `${String(i + 1).padStart(2, '0')}_${MONTHS[i]}`), names, bleed: info.bleed };
  out.K1.pass = out.K1.cmyk && ab.length === 12 && out.K1.a4_landscape && out.K1.names_ok && Math.abs((info.bleed.left ?? 0) - 8.504) < 0.1;
  out.K2 = { raster: (info.counts.raster ?? 0) + (info.counts.placed ?? 0), compound_or_outlines: info.counts.compound ?? 0 };
  out.K2.pass = out.K2.raster === 0;
  out.K9 = { global_swatches: info.globalSwatches.length, paragraph_styles: info.paragraphStyles.length - 1, unstyled_text: info.issues.unstyledText ?? 0, layers: info.layers.map((l) => l.name) };
  out.K9.pass = out.K9.global_swatches > 0 && out.K9.paragraph_styles > 0 && out.K9.unstyled_text === 0;
  const pf = await call('preflight', { ignore: ['live_text'] });
  out.K10 = { errors: pf.summary.errors, warnings: Object.keys(pf.checks).filter((k) => pf.checks[k].severity === 'warning') };
  out.K10.pass = pf.summary.errors === 0;
  out.counts = info.counts; out.fonts = info.fonts;
  const jan = await call('preview', { artboard: 0, reference: join(ROOT, 'bench/scenarios/calendar-reference.png'), save_to: join(run, 'january-vs-reference.png') });
  out.january = { rmse: jan.rmse, content_box: jan.content_box };
  for (const i of [6, 11]) await call('preview', { artboard: i, max_px: 900, save_to: join(run, `${String(i + 1).padStart(2, '0')}.png`) });
} finally {
  await call('documents', { action: 'close', name: opened.name, discard: true });
  await c.close();
}
writeFileSync(join(run, 'score-auto.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out, null, 1));
