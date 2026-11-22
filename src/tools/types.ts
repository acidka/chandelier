import type { ZodRawShape } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '../transport/transport.js';
import type { Runtime } from '../runtime.js';
import type { Settings } from '../settings.js';

export interface Ctx {
  T: Transport;
  rt: Runtime;
  /** Scratch directory for previews etc., removed on exit. */
  tmp: string;
  /** Names of documents this server created. */
  created: Set<string>;
  settings: Settings;
  /** all tools by name (batch looks steps up here) */
  tools: Map<string, ToolDef>;
}

/** A tool step as the runtime runs it (alone, or inside batch). */
export interface Step {
  cmd: string;
  args: Record<string, unknown>;
  /** settings overriding the session ones for this step */
  settings?: Record<string, unknown>;
  /** bring Illustrator to the front first (save/export, quirk A10) */
  activate?: boolean;
}

export interface ToolDef<S extends ZodRawShape = ZodRawShape> {
  name: string;
  description: string;
  shape: S;
  /** Tools that run inside Illustrator: turn validated args into a runtime step. Such tools can be batch steps. */
  step?(args: any, ctx: Ctx): Promise<Step> | Step;
  /** Node-side follow-up on the step's data (e.g. remember created documents). */
  after?(data: any, args: any, ctx: Ctx): void;
  /** Custom implementation (tools that are not a single runtime step). */
  run?(args: any, ctx: Ctx): Promise<CallToolResult>;
}

/** Thrown by step() for bad arguments: becomes a tool error without reaching Illustrator. */
export class ArgError extends Error {}

export const J = (v: unknown): string => JSON.stringify(v);
export const text = (v: unknown): CallToolResult => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : J(v) }] });
export const fail = (msg: string): CallToolResult => ({ content: [{ type: 'text', text: msg }], isError: true });
