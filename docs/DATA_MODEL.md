# archon-note — Data Model

> Read this file before changing the `ArchonNote` shape, the `pluginData` slot layout, or anything that affects save/load.

## Where the data lives

```
host project state
└── installedPlugins['archon-note'] : InstalledPlugin
    └── pluginData : ArchonNotePluginData
```

`installedPlugins[*].pluginData` is part of the host's standard project state and is expected to be serialised by the host's persistence pipeline (in-browser local storage, JSON file export/import, and any cloud sync flow the host implements). archon-note never stores anything outside this slot — there is no `localStorage`, no `IndexedDB`, no in-memory persistent state on the plugin side.

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
  fontFamily: 'sans' | 'marker';                // see FONT_STACKS in src/constants.ts
}
```

### Field invariants

| Field | Invariant |
|-------|-----------|
| `id` | Unique within `notes`. Never reused. |
| `position.x/y` | Any finite number; world units. |
| `size.width/height` | `≥ MIN_NOTE_SIZE` (60×60). Enforced by `Note.tsx` `applyResize`. |
| `text` | UTF-8 string; freeform. Empty allowed. |
| `bgColor` | Hex; should match a swatch from `src/colors.ts`. Unknown hex falls back to default text color. |
| `fontFamily` | Exactly `'sans'` (system Sans Serif) or `'marker'` (Permanent Marker via Google Fonts). Legacy `'serif'` from older plugin builds is normalized to `'marker'` on read in `src/store/notesStore.ts` `normalizeNote`. Anything else is treated as `'sans'`. |

### What is NOT stored

- **Font size** — recomputed every render via `src/utils/fitText.ts`.
- **Selection / hover state** — local React state in `NotesOverlay.tsx`.
- **Drag / resize transient values** — local state in `Note.tsx`, only committed on `pointerup`.
- **Undo history** — owned by the host, surfaced via `'PLUGIN_DATA_UPDATE'` history commands the plugin pushes through `applyPluginDataDelta`.

## Defensive normalization on read

`src/store/notesStore.ts` `readNotesData(api)`:

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
src/store/notesStore.ts helper (createNote / updateNote / deleteNote / bringToFront)
        │
        ▼
api.applyPluginDataDelta({ set: { notes, noteOrder } }, label)
        │       (host-side: builds undo delta, pushes 'PLUGIN_DATA_UPDATE' command)
        ▼
host applies the patch to installedPlugins[id].pluginData
        │
        ▼
host persists the project (debounced)
host fires its project-changed signal
        │
        ▼
plugin's subscribeToProjectChanges callback runs → re-render
```

## Adding a new field

1. Add the field to `ArchonNote` in `src/types.ts`.
2. Decide a default. If old projects shouldn't break: tolerate `undefined` in renderers, OR add a normalization step in `src/store/notesStore.ts` `readNotesData`.
3. Update `Note.tsx` to render/use the field.
4. Update `src/store/notesStore.ts` `createNote` / `updateNote` callsites if the new field is set on creation.
5. Document the field in this file (table above).

## Removing a field

1. Stop reading it in `Note.tsx` and `src/store/notesStore.ts`.
2. Optionally add a normalization step in `readNotesData` to strip the field from old projects on load (otherwise it lingers harmlessly inside `pluginData`).
3. Update this file.

## Concurrent edits

If the host syncs the project across multiple devices (cloud / shared edit sessions), the plugin's `pluginData` is treated like any other top-level project record by the host's merge strategy. archon-note assumes a last-write-wins semantic on the whole `pluginData` blob — acceptable for sticky notes. Plugins needing finer-grained conflict resolution would have to layer their own merge logic on top.

## Schema version

`ArchonNotePluginData` is currently version 1 (no version field). If a breaking change is needed in the future:

- Add `version: number` to the top-level shape.
- Update `readNotesData` to detect missing/old version and migrate inline.
- Bump the plugin's `version` in `plugin.json` and `package.json`.
