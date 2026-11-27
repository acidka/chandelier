// Plan-then-run (docs/research/plan-then-run-plan.md § 3.1): what each tool call does to documents.
// read    — never needs a plan (looks, the user's view: selection, active document/layer/artboard, opening a file)
// change  — changes a document (or makes one): needs an approved plan while configure {approve: "plan"}
// files   — writes or closes files (save, save_as, close, export): needs a plan, and runs last in one
// The runtime has the same rule for its commands (A.needsPlan in src/runtime/plan.jsx); a unit test keeps them equal.

export type Kind = 'read' | 'change' | 'files';

const READ = new Set(['status', 'configure', 'document_info', 'find_items', 'get_items', 'get_tree', 'fonts', 'preflight', 'preview', 'selection', 'events', 'tools']);
const LISTS = new Set(['swatches', 'styles', 'symbols']);
const STRUCTURE = new Set(['layers', 'artboards']);

/** Every tool the server has must be listed here or in the change list (unit test), so a new tool can't slip past. */
export const CHANGE = new Set(['create_shape', 'create_path', 'create_text', 'edit_text', 'modify_items', 'delete_items', 'transform_items',
  'duplicate_items', 'arrange_items', 'align_items', 'path_ops', 'place', 'symbols', 'menu_command', 'run_script', 'effects', 'swatches', 'styles',
  'layers', 'artboards', 'data_merge', 'scene', 'history', 'documents', 'batch', 'export']);
export const KNOWN = new Set([...READ, ...CHANGE]);

export function classify(tool: string, a: any = {}): Kind {
  const act = a?.action;
  if (READ.has(tool)) return 'read';
  if (tool === 'documents') return act === 'list' || act === 'open' || act === 'activate' ? 'read' : act === 'new' ? 'change' : 'files';
  if (tool === 'export') return 'files';
  if (STRUCTURE.has(tool)) return !act || act === 'list' || act === 'activate' ? 'read' : 'change';
  if (LISTS.has(tool)) return !act || act === 'list' ? 'read' : 'change';
  if (tool === 'history') return act === 'redo' ? 'change' : 'read'; // undo only takes changes back (P-G)
  if (tool === 'scene') return act === 'build' || act === 'refine' ? 'change' : 'read';
  if (tool === 'batch') return 'change'; // decided per step (src/plan/plan.ts gate)
  return 'change';
}

/** Tools that can't be part of a plan (not batch steps, or they open and close documents themselves). */
export const UNPLANNABLE: Record<string, string> = {
  data_merge: 'data_merge makes its own copies and files; plan the template changes as batch steps, or turn approval off for it',
  scene: 'scene build and refine run their own batches; in approval mode build with create_path / batch steps (scene analyze and edit still work)',
};
