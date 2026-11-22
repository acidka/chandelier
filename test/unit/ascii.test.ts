import { describe, it, expect } from 'vitest';
import { ascii } from '../../src/transport/ascii.js';

describe('ascii', () => {
  it('escapes non-ASCII only', () => {
    expect(ascii('a "Січень"\n')).toBe('a "\\u0421\\u0456\\u0447\\u0435\\u043d\\u044c"\n');
    expect(ascii(' €')).toBe('\\u2028\\u20ac');
  });
  it('round-trips through JS evaluation', () => {
    const s = 'Привіт — “quotes” 😀';
    expect(eval(ascii(JSON.stringify(s)))).toBe(s);
  });
});
