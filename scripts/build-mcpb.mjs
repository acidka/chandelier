#!/usr/bin/env node
// Build the Claude Desktop bundle: build/chandelier-<version>.mcpb
// Stages dist/ (no source maps) + production dependencies + manifest.json + icon, validates and packs with the
// official MCPB CLI (@anthropic-ai/mcpb, fetched by npx).
//   npm run build && node scripts/build-mcpb.mjs
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const OUT = join(ROOT, 'build'), STAGE = join(OUT, 'mcpb');
if (!existsSync(join(ROOT, 'dist/index.js'))) throw new Error('Run npm run build first.');

rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });
cpSync(join(ROOT, 'dist'), join(STAGE, 'dist'), { recursive: true, filter: (f) => !f.endsWith('.map') && !f.endsWith('.debug') }); // .debug: a dev install's DevTools port
for (const f of ['LICENSE', 'README.md']) cpSync(join(ROOT, f), join(STAGE, f));
cpSync(join(ROOT, 'docs/assets/brand/chandelier-mark-512.png'), join(STAGE, 'icon.png'));
writeFileSync(join(STAGE, 'package.json'), JSON.stringify({
  name: pkg.name, version: pkg.version, type: pkg.type, main: 'dist/index.js', dependencies: pkg.dependencies,
}, null, 2));
execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--no-package-lock'], { cwd: STAGE, stdio: 'inherit' });

// tool list for Claude Desktop's extension page: name + first sentence of each description
const { TOOLS } = await import(pathToFileURL(join(ROOT, 'dist/tools/index.js')).href);
const tools = TOOLS.map((t) => ({ name: t.name, description: t.description.split(/(?<=\.)\s|\n/)[0].trim() }));

const manifest = {
  manifest_version: '0.2',
  name: 'chandelier',
  display_name: 'Chandelier for Adobe Illustrator',
  version: pkg.version,
  description: 'Let Claude work in Adobe Illustrator: build, edit, check and export print-ready documents over one fast connection.',
  long_description: 'Chandelier keeps one persistent connection to Adobe Illustrator (~5 ms per call), runs many steps in one batch, ' +
    'offers typed tools plus ExtendScript for anything else, and covers print work: global swatches, paragraph styles, real bleed, ' +
    'PDF/X-4 with exact trim and bleed boxes, preflight and image previews compared with a reference. macOS, Illustrator 2025 or later; ' +
    'Illustrator must be running. It never launches Illustrator unless asked and only changes documents it created or was asked to change.',
  author: { name: 'acidka', url: 'https://github.com/acidka' },
  homepage: pkg.homepage,
  repository: { type: 'git', url: 'https://github.com/acidka/chandelier.git' },
  support: 'https://github.com/acidka/chandelier/issues',
  icon: 'icon.png',
  server: {
    type: 'node',
    entry_point: 'dist/index.js',
    mcp_config: { command: 'node', args: ['${__dirname}/dist/index.js'], env: {} },
  },
  tools,
  keywords: pkg.keywords,
  license: pkg.license,
  compatibility: { platforms: ['darwin', 'win32'], runtimes: { node: '>=22.15.0' } },
};
writeFileSync(join(STAGE, 'manifest.json'), JSON.stringify(manifest, null, 2));

const mcpb = (...a) => execFileSync('npx', ['-y', '@anthropic-ai/mcpb@2', ...a], { cwd: ROOT, stdio: 'inherit' });
mcpb('validate', join(STAGE, 'manifest.json'));
const file = join(OUT, `chandelier-${pkg.version}.mcpb`);
rmSync(file, { force: true });
mcpb('pack', STAGE, file);
console.log('Built', file);
