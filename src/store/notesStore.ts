import { ArchonNote, ArchonNotePluginData, ArchonPluginAPI, NoteFontFamily } from '../types';

/**
 * Coerce a possibly-legacy font-family value into the current enum.
 * Older plugin versions used `'sans' | 'serif'`; the second slot has been
 * renamed to `'marker'` (Permanent Marker) — old `'serif'` values are
 * mapped to `'marker'` on read so existing notes keep their second-font choice.
 */
function normalizeFontFamily(v: unknown): NoteFontFamily {
  if (v === 'sans' || v === 'marker') return v;
  if (v === 'serif') return 'marker';
  return 'sans';
}

/** Default integration-layer id used when migrating legacy notes (predating
 *  the `layerId` field on `ArchonNote`). The host always provisions an
 *  integration layer with this id (`'default-layer'`) on every project,
 *  making it a safe destination for orphan notes. */
const LEGACY_DEFAULT_LAYER_ID = 'default-layer';

function normalizeNote(raw: unknown): ArchonNote | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ArchonNote> & { fontFamily?: unknown; layerId?: unknown };
  if (typeof r.id !== 'string') return null;
  return {
    id: r.id,
    position: r.position && typeof r.position.x === 'number' && typeof r.position.y === 'number'
      ? { x: r.position.x, y: r.position.y }
      : { x: 0, y: 0 },
    size: r.size && typeof r.size.width === 'number' && typeof r.size.height === 'number'
      ? { width: r.size.width, height: r.size.height }
      : { width: 220, height: 220 },
    text: typeof r.text === 'string' ? r.text : '',
    bgColor: typeof r.bgColor === 'string' ? r.bgColor : '#ffd84d',
    fontFamily: normalizeFontFamily(r.fontFamily),
    // Migration: notes saved before the layerId field existed get assigned
    // to the default integration layer (the one the host always creates).
    layerId: typeof r.layerId === 'string' && r.layerId.length > 0
      ? r.layerId
      : LEGACY_DEFAULT_LAYER_ID,
  };
}

/**
 * Tiny store wrapping the host's plugin-data slot. Reads always go through
 * `api.getPluginData()` (which is fresh on every call); writes go through
 * `api.applyPluginDataDelta` so they are undo-able via global Cmd+Z.
 *
 * The `pluginData` shape is fixed at:
 *   {
 *     notes: Record<id, ArchonNote>,
 *     noteOrder: string[]
 *   }
 *
 * Any unexpected shape (older versions, missing fields) is normalised on read
 * — the store always returns a complete `ArchonNotePluginData` object.
 */

const EMPTY: ArchonNotePluginData = { notes: {}, noteOrder: [] };

export function readNotesData(api: ArchonPluginAPI): ArchonNotePluginData {
  const raw = api.getPluginData() as Partial<ArchonNotePluginData> | undefined;
  if (!raw) return { ...EMPTY, notes: {}, noteOrder: [] };
  // Normalize each note so legacy fields (e.g. fontFamily: 'serif') are mapped
  // to current values, and missing fields get sensible defaults.
  const rawNotes = (raw.notes && typeof raw.notes === 'object') ? raw.notes as Record<string, unknown> : {};
  const notes: Record<string, ArchonNote> = {};
  for (const id of Object.keys(rawNotes)) {
    const n = normalizeNote(rawNotes[id]);
    if (n) notes[n.id] = n;
  }
  const order = Array.isArray(raw.noteOrder) ? raw.noteOrder.filter(id => id in notes) : Object.keys(notes);
  // Append any notes missing from order (defensive: pluginData edited externally).
  for (const id of Object.keys(notes)) {
    if (!order.includes(id)) order.push(id);
  }
  return { notes, noteOrder: order };
}

function commit(
  api: ArchonPluginAPI,
  next: ArchonNotePluginData,
  label: string,
): void {
  api.applyPluginDataDelta(
    { set: { notes: next.notes, noteOrder: next.noteOrder } },
    label,
  );
}

export function createNote(api: ArchonPluginAPI, note: ArchonNote): void {
  const cur = readNotesData(api);
  const next: ArchonNotePluginData = {
    notes: { ...cur.notes, [note.id]: note },
    noteOrder: [...cur.noteOrder, note.id],
  };
  commit(api, next, 'Add note');
}

export function updateNote(
  api: ArchonPluginAPI,
  id: string,
  patch: Partial<Omit<ArchonNote, 'id'>>,
  label: string,
): void {
  const cur = readNotesData(api);
  const existing = cur.notes[id];
  if (!existing) return;
  const next: ArchonNotePluginData = {
    notes: { ...cur.notes, [id]: { ...existing, ...patch } },
    noteOrder: cur.noteOrder,
  };
  commit(api, next, label);
}

export function deleteNote(api: ArchonPluginAPI, id: string): void {
  const cur = readNotesData(api);
  if (!(id in cur.notes)) return;
  const { [id]: _removed, ...rest } = cur.notes;
  void _removed;
  const next: ArchonNotePluginData = {
    notes: rest,
    noteOrder: cur.noteOrder.filter(n => n !== id),
  };
  commit(api, next, 'Delete note');
}

/** Move a note to the end of `noteOrder` so it renders on top. */
export function bringToFront(api: ArchonPluginAPI, id: string): void {
  const cur = readNotesData(api);
  if (!(id in cur.notes) || cur.noteOrder[cur.noteOrder.length - 1] === id) return;
  const next: ArchonNotePluginData = {
    notes: cur.notes,
    noteOrder: [...cur.noteOrder.filter(n => n !== id), id],
  };
  commit(api, next, 'Bring note to front');
}
