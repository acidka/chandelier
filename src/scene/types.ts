// scene: the model kept between analyze, edit, build and refine.
import type { Img } from '../image.js';
import type { Lab } from './color.js';
import type { Quant } from './quantize.js';
import type { Segmentation } from './regions.js';
import type { PlanarMap } from './planar.js';
import type { Seg } from '../fitcurve.js';
import type { Prim, PrimKind } from './primitives.js';
import type { Shape } from './stack.js';
import type { Ramp } from './ramps.js';

export type Detail = 'low' | 'normal' | 'high';

export interface Params {
  image: string;
  crop?: number[];
  map?: number[][];
  bilinear?: boolean;
  size?: number[];
  colors: number;
  minDe: number;
  detail: Detail;
  maxPx: number;
}

/** an ink: one global swatch at build */
export interface Colour { L: number; a: number; b: number; swatch?: string; name?: string }

/** what edits changed about a region (by id; ids never change after analyze) */
export interface RegionMeta { colour: number; name?: string; drop?: boolean; text?: boolean; tol?: number; /** force a primitive, or 'free' = never */ prim?: PrimKind | 'free'; /** linear gradient from the region's colour plane */ ramp?: boolean; /** a translucent layer: drawn over these overlap regions too, multiply */ multiply?: number[]; /** grouped as a logo with what lies on it */ logo?: boolean; /** not drawn: a named empty box instead */ placeholder?: boolean }

export interface Scene {
  id: string;
  dir: string;
  params: Params;
  source: { path: string; sha1: string; w: number; h: number };
  work: Img;
  toSource: (x: number, y: number) => [number, number];
  lab: Lab;
  /** looks like a photo (noise): ramps are lighting and get flattened */
  photo: boolean;
  /** ramp groups found at analyze: merged (photo) or offered as a hint */
  rampGroups: { ids: number[]; dL: number; merged: boolean }[];
  quant: Quant;
  seg: Segmentation;
  colours: Colour[];
  meta: RegionMeta[];
  /** z overrides from edits: ids moved, in order (applied after the automatic order) */
  zMoves: { id: number; how: 'top' | 'bottom' | 'over' | 'under'; ref?: number }[];
  tile: boolean;
  /** global tolerance (px) */
  tol: number;
  /** tolerance per region pair "a,b" (refine tightens edges that miss) */
  edgeTol?: Record<string, number>;
  edits: string[];
  /** boxes left for live text (working px) and the regions in them */
  textBoxes: { rect: number[]; ids: number[] }[];
  // derived (recompute)
  pm: PlanarMap;
  fits: Seg[][];
  z: number[];
  /** primitive per region (null: drawn from its fitted outline) */
  prims: (Prim | null)[];
  ramps: (Ramp | null)[];
  /** drawn shapes, bottom to top */
  shapes: Shape[];
  render: Img;
  /** per region: rendered vs labelled IoU */
  iou: number[];
  estRmse: number;
  ms: number;
  built?: { doc?: string; layer: string; rect: number[]; artboard?: number; bleed?: number; units?: string; items: Record<string, string> };
}

export const DETAIL: Record<Detail, { passes: number; area: number; tol: number }> = {
  low: { passes: 2, area: 4, tol: 2 },
  normal: { passes: 1, area: 1, tol: 1 },
  high: { passes: 0, area: 0.25, tol: 0.6 },
};
