# archon-note — Architecture

> Read this file before changing any of: `Note.tsx` state machine, drag/resize, fit-text, drawing/view-mode handling, or undo strategy.

## File layout

```
archon-note/src/
├── index.tsx               // __archon_register_plugin + onIconClick + lifecycle
├── types.ts                // ArchonNote, ArchonNotePluginData, host API mirror
├── constants.ts            // sizes, padding, font stacks, debounce, z-indexes
├── colors.ts               // 16-swatch palette + textColorFor
├── fonts.css               // Open Sans + PT Serif italic + textarea reset
├── store/
│   ├── notesStore.ts       // readNotesData, createNote, updateNote, deleteNote, bringToFront
│   └── viewport.ts         // worldToScreen, screenToWorld, viewportCenterWorld, readViewport
├── utils/
│   ├── fitText.ts          // binary-search font-size that fits text in a box
│   └── id.ts               // RFC4122-ish v4 id (no uuid dep)
└── components/
    ├── NotesOverlay.tsx    // root: subscriptions, selection state, iterate notes
    ├── Note.tsx            // one note: state machine, drag/resize, edit, render
    ├── DeleteButton.tsx    // red-circle X (top-right of selected note)
    └── StylingPopup.tsx    // 16-color grid + Aa/Aa font toggle
```

## Lifecycle

```
host loads plugin script
        ↓
window.__archon_register_plugin(plugin)
        ↓
pluginRegistry sets status='active'
        ↓
CanvasOverlayPluginHost (host) creates a <div> at z-[400] and calls
plugin.mountOverlay(div, api)
        ↓
src/index.tsx: ReactDOM.createRoot(div).render(<NotesOverlay api={api} />)
        ↓
NotesOverlay subscribes to viewport / project / view-mode / drawing-mode
        ↓
each ArchonNote rendered as a <Note> child
```

User clicks the plugin icon (anywhere) → host's PluginHost.tsx detects `displayMode === 'canvas-overlay'`, dispatches `plugin.onIconClick(api)`, immediately closes the host slot. `onIconClick` builds an `ArchonNote` at the viewport center and calls `createNote(api, note)`.

## Note state machine (`Note.tsx`)

```
idle ──single click──▶ selected ──double click──▶ editing
 ▲                       │                          │
 │                       │                          │
 └──── click outside ────┴── click outside ─────────┘
                                             (and commit text)
```

| State    | Visible UI                                                | Pointer behavior                          |
|----------|-----------------------------------------------------------|-------------------------------------------|
| idle     | sticky body + text                                        | hover = grab cursor; pointerdown starts click-or-drag |
| selected | + 1.5px blue border + 8 resize handles + delete X + popup | drag body = move; drag handle = resize; double-click → editing |
| editing  | + textarea focused, pre-filled with current text          | textarea owns pointer events; ESC → selected; click-outside commits + → idle |

### Single-click vs drag (the Miro-like dispatch)

Implemented in `Note.tsx` `startSession('click-or-drag')`:

1. `pointerdown` → record `startScreen`, set `mode = 'click-or-drag'`, attach window-level move/up listeners.
2. `pointermove` → if `|dx| ≥ 5 || |dy| ≥ 5` (`DRAG_THRESHOLD_PX`), promote to `mode = 'drag'`. Drag is purely visual until `pointerup` (transient state in component, no Redux dispatch).
3. `pointerup`:
   - mode still `'click-or-drag'` → pure click → promote to `selected` (and `bringToFront`).
   - mode `'drag'` → commit position via `updateNote` (single undo step), promote to `selected`.
   - mode `'resize'` → commit `position` + `size` via `updateNote`.

This means **moving a note never produces a half-undone state** — every drag is one Cmd+Z.

### Double-click → editing

`onDoubleClick` on the root → `setSelection({ id, mode: 'editing' })`. Effect in `Note.tsx` runs on state change, focuses the textarea via `requestAnimationFrame` and moves caret to end. Text is buffered in component state; committed via `updateNote(..., 'Edit note text')` after `TEXT_COMMIT_DEBOUNCE_MS = 300` of idle, or on blur, or on ESC. Sequential edits within the debounce window collapse to a single undo step (because the patched field is overwritten before the previous patch is committed).

### Resize

8 SVG-circle handles (`'n','s','e','w','ne','nw','se','sw'`). Pointer events on handles `stopPropagation` so the body's click-or-drag doesn't fire. `applyResize(edge, origPos, origSize, dxWorld, dyWorld)` adjusts position when the dragged edge is `'n'` or `'w'` so the opposite edge stays anchored. Min size enforced via `MIN_NOTE_SIZE` from `constants.ts`.

### Click-outside / ESC

Mounted in `Note.tsx` via `document.addEventListener('pointerdown', handler, true)` (capture phase). Skipped if the click landed in: this note's root, a styling popup (`[data-archon-note-popup]`), or a delete button (`[data-archon-note-delete]`). On a real outside click: flush text, then `onRequestDeselect()`.

ESC: in `editing` → flush + go to `selected`; in `selected` → go to `idle`.

## Viewport math

All coords inside the plugin are **world** units, matching the host's canvas coordinate system. Conversion lives in `store/viewport.ts`:

```
screen.x = (world.x + offset.x) * zoom
screen.y = (world.y + offset.y) * zoom
```

`Note.tsx` re-projects on every render using the latest viewport snapshot from `NotesOverlay`. Viewport snapshot is refreshed via `api.subscribeToViewport(refresh)` so panning, zooming, and overlay-resizing all trigger re-render.

`onIconClick` uses `viewportCenterWorld(vp)` to drop new notes at the visible center.

## Dynamic font sizing (`utils/fitText.ts`)

Binary search the integer range `[MIN_FIT_FONT_SIZE, MAX_FIT_FONT_SIZE]`. For each candidate, build a CSS font string from `FONT_STACKS` + `FONT_STYLE`, set it on a singleton offscreen canvas-2d context, wrap text into the inner box (`size - 2*NOTE_PADDING`) using greedy word-wrap, sum line heights with `LINE_HEIGHT_MULTIPLIER = 1.2`. The largest font that doesn't overflow `innerHeight` wins.

Empty text falls back to `MIN_FIT_FONT_SIZE` so the placeholder caret has a sensible size.

## Drawing-mode + view-mode handling

`NotesOverlay` reads `api.getIsViewMode()` and `api.getIsDrawingMode()` and subscribes to changes. Each `Note` receives both flags. Behavior:

- **View mode** (`isViewMode === true`): `interactive` is false → all `pointerdown`/`startSession` short-circuit. `pointer-events: none` on the note root. Selection auto-collapses (`useEffect` in NotesOverlay).
- **Drawing mode** (`isDrawingMode === true`): same `interactive` short-circuit + opacity drops to `0.55`. Selection auto-collapses too — no styling popup or handles can be reached while the user is drawing.

## Undo / redo

Every mutation goes through `notesStore.ts` → `api.applyPluginDataDelta({ set: { notes, noteOrder } }, label)`. The host's bridge:

1. Reads the **before** value of `pluginData`.
2. Computes `undoSet/undoRemove` so undo restores the exact prior keys.
3. Dispatches `applyPluginDataDelta` reducer (forward).
4. Pushes one `pushCommand({ type: 'PLUGIN_DATA_UPDATE', do, undo })` onto the global history stack.

That means **global Cmd+Z reverts plugin actions just like canvas actions**. There is no plugin-internal undo stack.

## Why we use `applyPluginDataDelta`, not `setPluginData`

`setPluginData` replaces `pluginData` wholesale and does **not** push a history command — undo would not roll it back. `applyPluginDataDelta` is the only mutation API archon-note uses. Direct calls to `setPluginData` from the plugin would silently break undo.

## Z-order

| Layer (in DOM)                                 | z-index             |
|------------------------------------------------|---------------------|
| host `<canvas>`                                | < 100               |
| `CanvasOverlayPluginHost` container             | `z-[400]`           |
| Note (idle)                                    | `Z_NOTE_BASE = 1`   |
| Note (selected)                                | `Z_NOTE_SELECTED=2` |
| Note (editing)                                 | `Z_NOTE_EDITING=3`  |
| Styling popup (inside selected/editing note)   | `Z_STYLING_POPUP=10`|
| Delete button (inside selected/editing note)   | `Z_DELETE_BUTTON=11`|
| host `DrawingTools` toolbar                    | `z-[1000]`          |

The overlay container is `pointer-events: none` so clicks pass through to the canvas; each note opts in via `pointer-events: auto` only when `interactive`.

## Adding a new feature — quick checklist

| You want to… | Files to touch |
|--------------|----------------|
| Add a new note field (e.g. `tilt`) | `types.ts` + `notesStore.ts` (initial value) + `Note.tsx` (render/use) + `DATA_MODEL.md` (schema) |
| Add a new color | `colors.ts` (`NOTE_PALETTE` + `UI_SPEC.md`) |
| Add a new interaction (e.g. arrow keys) | `Note.tsx` (state machine + handler) + `ARCHITECTURE.md` |
| Add a new host API dependency | `types.ts` `ArchonPluginAPI` mirror + corresponding host work + `HOST_CONTRACT.md` |
