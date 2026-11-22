import { describe, it, expect } from 'vitest';
import { expandGrid } from '../../src/tools/text.js';

describe('create_text grid', () => {
  it('lays cells out row by row, skips empty cells, applies column props', () => {
    const items = expandGrid({ x: 10, y: 20, cols: 3, dx: 30, dy: 15, cells: ['', 1, 2, 3, null, { text: 5, fill: 'red' }], col_props: { '2': { fill: 'swatch:Red' } } });
    expect(items).toEqual([
      { x: 40, y: 20, text: '1' },
      { fill: 'swatch:Red', x: 70, y: 20, text: '2' },
      { x: 10, y: 35, text: '3' },
      { fill: 'red', x: 70, y: 35, text: '5' },
    ]);
  });
});
