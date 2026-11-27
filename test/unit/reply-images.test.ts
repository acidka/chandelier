import { describe, it, expect } from 'vitest';
import { fitImages } from '../../src/server.js';
import { decodePng, encodePng } from '../../src/image.js';
import { mulberry32 } from '../../src/scene/quantize.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// a noisy image compresses badly, like a photo render
const noisy = (w: number, h: number) => { const rnd = mulberry32(7), rgb = new Uint8Array(w * h * 3); for (let i = 0; i < rgb.length; i++) rgb[i] = (rnd() * 256) | 0; return encodePng({ w, h, rgb }).toString('base64'); };

describe('reply image budget (bug #28)', () => {
  it('shrinks every image by one factor when a reply passes the budget, and says so', () => {
    const r: CallToolResult = { content: [{ type: 'image', data: noisy(300, 200), mimeType: 'image/png' }, { type: 'image', data: noisy(300, 200), mimeType: 'image/png' }, { type: 'text', text: '{}' }] };
    const before = r.content.slice(0, 2).reduce((n, c) => n + (c as { data: string }).data.length, 0);
    fitImages(r, { total: before / 3, each: before });
    const imgs = r.content.filter((c) => c.type === 'image') as { data: string }[];
    expect(imgs.reduce((n, c) => n + c.data.length, 0)).toBeLessThanOrEqual(before / 3);
    const a = decodePng(Buffer.from(imgs[0].data, 'base64')), b = decodePng(Buffer.from(imgs[1].data, 'base64'));
    expect(a.w).toBeLessThan(300); expect([a.w, a.h]).toEqual([b.w, b.h]); // same factor
    expect((r.content[r.content.length - 1] as { text: string }).text).toMatch(/^images shrunk ×0\.\d+ to fit one reply/);
  });
  it('leaves a reply under the budget as it is', () => {
    const data = noisy(50, 40), r: CallToolResult = { content: [{ type: 'image', data, mimeType: 'image/png' }] };
    fitImages(r);
    expect(r.content).toHaveLength(1);
    expect((r.content[0] as { data: string }).data).toBe(data);
  });
});
