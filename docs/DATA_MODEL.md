# archon-note — Data Model

> Read this file before changing the `ArchonNote` shape, the `pluginData` slot layout, or anything that affects save/load.

## Where the data lives

```
host ProjectState
└── installedPlugins['archon-note'] : InstalledPlugin
    └── pluginData : ArchonNotePluginData
```

`installedPlugins.pluginData` is already serialised by:

- `client/src/store/persistence.ts` — `localStorage`
- `client/src/components/Toolbar/useProjectIO.ts` — JSON file export
- Google Drive save/load (uses the same `{ project }` envelope)
- `client/src/hooks/syncMerge.ts` — Drive concurrent-edit merge (LWW per-record on `installedPlugins`)

archon-note never stores anything outside this slot — there is no `localStorage`, no `IndexedDB`, no in-memory persistent state.

## Schema

```ts
interface ArchonNotePluginData {
  notes: Record<string, ArchonNote>;
  noteOrder: string[];   // bottom-to-top z-order; later = on top
}

interface ArchonNote {
  id: string;                                   // RFC4122-ish v4 (no uuid dep)
  position: { x: number; y: number };           // world coords (top-left)
  size:     { width: number; height: number };  // world units
  text: string;                                 // freeform; \n preserved
  bgColor: string;                              // hex from NOTE_PALETTE
  fontFamily: 'sans' | 'marker';                // see FONT_STACKS in constants.ts
}
```

### Field invariants

| Field | Invariant |
|-------|-----------|
| `id` | Unique within `notes`. Never reused. |
| `position.x/y` | Any finite number; world units. |
| `size.width/height` | `≥ MIN_NOTE_SIZE` (60×60). Enforced by `Note.tsx` `applyResize`. |
| `text` | UTF-8 string; freeform. Empty allowed. |
| `bgColor` | Hex; should match a swatch from `colors.ts`. Unknown hex falls back to default text color. |
| `fontFamily` | Exactly `'sans'` (system Sans Serif) or `'marker'` (Permanent Marker via Google Fonts). Legacy `'serif'` from older plugin builds is normalized to `'marker'` on read in `store/notesStore.ts` `normalizeNote`. Anything else is treated as `'sans'`. |

### What is NOT stored

- **Font size** — recomputed every render via `utils/fitText.ts`.
- **Selection / hover state** — local React state in `NotesOverlay.tsx`.
- **Drag / resize transient values** — local state in `Note.tsx`, only committed on `pointerup`.
- **Undo history** — host's `historySlice` owns it via `'PLUGIN_DATA_UPDATE'` commands.

## Defensive normalization on read

`store/notesStore.ts` `readNotesData(api)`:

```
const raw = api.getPluginData() as Partial<ArchonNotePluginData> | undefined;
notes      = raw?.notes  if object, else {}
noteOrder  = raw?.noteOrder if array, else Object.keys(notes)
            then drop ids missing from notes
            then append any notes missing from order (defensive: external mutations)
```

This means the plugin tolerates:

- A missing `pluginData` slot (project saved before archon-note was installed)
- A missing `notes` or `noteOrder` field
- A `noteOrder` that references deleted notes (filtered out)
- A `notes` set that has ids missing from `noteOrder` (appended)

## How a mutation flows

```
user action (drag, edit, color pick, …)
        │
        ▼
notesStore.* helper (createNote / updateNote / deleteNote / bringToFront)
        │
        ▼
api.applyPluginDataDelta({ set: { notes, noteOrder } }, label)
        │       (host bridge in CanvasOverlayPluginHost.tsx)
        ▼
1. read before-snapshot of pluginData
2. compute undo delta
3. dispatch applyPluginDataDelta reducer (forward)
4. dispatch pushCommand({ type: 'PLUGIN_DATA_UPDATE', do, undo })
        │
        ▼
projectSlice.applyPluginDataDelta merges the patch into installedPlugins[id].pluginData
        │
        ▼
store update → persistence.saveState (debounced) writes to localStorage
              + plugin's subscribeToProjectChanges callback fires → re-render
```

## Adding a new field

1. Add the field to `ArchonNote` in `src/types.ts`.
2. Decide a default. If old projects shouldn't break: tolerate `undefined` in renderers, OR add a normalization step in `notesStore.readNotesData`.
3. Update `Note.tsx` to render/use the field.
4. Update `notesStore.createNote` / `updateNote` callsites if the new field is set on creation.
5. Document the field in this file (table above).

**Do NOT** add the field to `client/src/types.ts` `ArchonNote` — that namespace is host-only and archon-note carries its own mirror in `archon-note/src/types.ts`.

## Removing a field

1. Stop reading it in `Note.tsx` and `notesStore.ts`.
2. Optionally add a normalization step in `notesStore.readNotesData` to strip the field from old projects on load (otherwise it lingers harmlessly inside `pluginData`).
3. Update this file.

## Cross-host concerns

- **Drive merge (`syncMerge.ts`)** — `installedPlugins` is in `COLLECTION_KEYS`, so per-record merge is JSON-equality based. Concurrent edits to the same plugin's `pluginData` resolve LWW (remote wins, conflict counted). For archon-note this means two users editing notes on the same Drive file get last-write-wins per save round-trip — acceptable for sticky notes.
- **`migrateProject.ts`** — initialises `installedPlugins = {}` for legacy files (no archon-note data yet). `pluginData` itself has no per-collection migration loop.

## Schema version

`ArchonNotePluginData` is currently version 1 (no version field). If a breaking change is needed in the future:

- Add `version: number` to the top-level shape.
- Update `readNotesData` to detect missing/old version and migrate inline.
- Bump the plugin's `version` in `plugin.json` and `package.json`.
