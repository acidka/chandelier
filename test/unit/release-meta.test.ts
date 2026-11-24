import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { VERSION } from '../../src/version.js';

const json = (p: string) => JSON.parse(readFileSync(new URL('../../' + p, import.meta.url), 'utf8'));

// One version everywhere a release names it; the MCP registry also checks that the npm package's
// mcpName equals server.json's name (registry listing, roadmap phase 6).
describe('release metadata', () => {
  const pkg = json('package.json'), server = json('server.json');
  it('every manifest carries the package version', () => {
    expect(VERSION).toBe(pkg.version);
    expect(server.version).toBe(pkg.version);
    expect(server.packages[0].version).toBe(pkg.version);
    expect(json('plugin/.claude-plugin/plugin.json').version).toBe(pkg.version);
    expect(json('.claude-plugin/marketplace.json').plugins[0].version).toBe(pkg.version);
  });
  it('registry listing matches the npm package', () => {
    expect(pkg.mcpName).toBe(server.name);
    expect(server.packages[0].identifier).toBe(pkg.name);
    expect(server.description.length).toBeLessThanOrEqual(100);
  });
});
