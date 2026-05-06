import { ArchonNote, ArchonNotePluginData, ArchonPluginAPI } from '../types';

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
  const notes = (raw.notes && typeof raw.notes === 'object') ? raw.notes as Record<string, ArchonNote> : {};
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
