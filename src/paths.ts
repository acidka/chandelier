// Files shipped next to the compiled code (copied to dist/ by scripts/copy-assets.mjs).
// src/ and dist/ have the same layout, so this works from both (vitest runs src/ directly).
import { fileURLToPath } from 'node:url';

export const asset = (rel: string): string => fileURLToPath(new URL('./' + rel, import.meta.url));
export const RUNTIME_DIR = asset('runtime');
