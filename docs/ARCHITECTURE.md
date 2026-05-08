# archon-note — Architecture

> Read this file before changing any of: `Note.tsx` state machine, drag/resize, fit-text, drawing/view-mode handling, or undo strategy.

## File layout

```
archon-note/src/
├── index.tsx               // __archon_register_plugin + onIconClick + lifecycle
├── types.ts                // ArchonNote, ArchonNotePluginData, host API mirror
├── constants.ts            // sizes, padding, font stacks, debounce, z-indexes
├── colors.ts               // 16-swatch palette + textColorFor
├── fonts.css               // Permanent Marker + Caveat (Cyrillic fallback) + textarea reset
├── store/
│   ├── notesStore.ts       // readNotesData, createNote, updateNote, deleteNote, bringToFront
│   └── viewport.ts         // worldToScreen, screenToWorld, viewportCenterWorld, readViewport
├── utils/
│   ├── fitText.ts          // binary-search font-size that fits text in a box
│   ├── popupPosition.ts    // smart-positioning for the styling popup
│   └── id.ts               // RFC4122-ish v4 id (no uuid dep)
└── components/
    ├── NotesOverlay.tsx    // root: subscriptions, selection state, iterate notes
    ├── Note.tsx            // one note: state machine, drag/resize, edit, render, rAF loop
    ├── DeleteButton.tsx    // red-circle X (top-right of selected note)
    ├── StylingButton.tsx   // small Palette button above the resize grid
    └── StylingPopup.tsx    // 16-color grid + Aa/Aa font toggle
```

## Lifecycle

```
host loads plugin script
        ↓
window.__archon_register_plugin(plugin)
        ↓
host registry marks the plugin active
        ↓
host creates a <div> overlay above the canvas and calls
plugin.mountOverlay(div, api)
        ↓
src/index.tsx: ReactDOM.createRoot(div).render(<NotesOverlay api={api} />)
        ↓
NotesOverlay subscribes to project / view-mode / drawing-mode
        ↓
each ArchonNote rendered as a <Note> child
```

When the user clicks the plugin icon (anywhere the host surfaces it) the host detects `displayMode === 'canvas-overlay'` and dispatches `plugin.onIconClick(api)` instead of opening any host UI. `onIconClick` builds an `ArchonNote` at the viewport center and calls `createNote(api, note)`.

## Note state machine (`Note.tsx`)

```
idle ──single click──▶ selected ──double click──▶ editing
 ▲                       │                          │
 │                       │                          │
 └──── click outside ────┴── click outside ─────────┘
                                             (and commit text)
```

| State    | Visible UI                                                                | Pointer behavior                          |
|----------|---------------------------------------------------------------------------|-------------------------------------------|
| idle     | sticky body + text                                                        | hover = grab cursor; pointerdown starts click-or-drag |
| selected | + 1.5px blue border + 8 resize handles + delete X + small Palette button (above the resize grid) | drag body = move; drag handle = resize; click Palette → toggle styling popup; double-click → editing |
| editing  | + textarea focused, pre-filled with current text                          | textarea owns pointer events; ESC → selected; click-outside commits + → idle |

### Styling popup vs styling button

The popup that contains the 16-color grid + the Sans/Marker font toggle is **NOT** auto-shown on selection. Instead a small `<StylingButton>` (Palette icon, 28×28 white pill with shadow) appears above the note's top edge by `STYLING_BUTTON_OFFSET = 36` CSS px — past the resize handles. Clicking the button calls `onTogglePopup(id)` on `NotesOverlay`, which flips `selection.popupOpen`.

When the popup is open:
- the `<StylingButton>` is hidden (the popup IS the button's open state),
- clicking the note body closes the popup but keeps selection (`onClosePopup`),
- clicking outside both popup and note deselects entirely (existing click-outside handler).

`selection.popupOpen` is per-selection state owned by `NotesOverlay` — switching to a different note resets it to `false`; re-selecting the same note (e.g. after a drag commit) preserves it so the popup doesn't blink shut mid-interaction.

### Smart popup positioning (`utils/popupPosition.ts`)

The popup is rendered as a **sibling** of the note in the React tree (not nested inside the note's div), so it lives in overlay-container CSS-pixel coordinates and can be placed anywhere. `computePopupPosition(noteScreenRect, viewportSize, popupSize, margin)` runs three passes:

1. **In viewport AND no overlap with the note** — try candidates in order: above → below → right → left.
2. **In viewport** (overlap allowed) — same order, fallback when no non-overlapping candidate fits (very small viewports).
3. **Clamp** the "above" candidate to viewport bounds — last resort, popup is at least visible and clickable.

This guarantees the popup is always inside the canvas viewport and prefers placements that keep the note's text readable.

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

### Click-outside / ESC / Delete

Mounted in `Note.tsx` via `document.addEventListener('pointerdown', handler, true)` (capture phase). Skipped if the click landed in: this note's root, a styling popup (`[data-archon-note-popup]`), or a delete button (`[data-archon-note-delete]`). On a real outside click: flush text, then `onRequestDeselect()`.

Keyboard shortcuts (window-level keydown, gated by `state !== 'idle'`):

| Key | In `selected` | In `editing` |
|-----|---------------|--------------|
| `Escape` | Deselect (`onRequestDeselect`) | Flush text + back to selected (`onRequestSelect`) |
| `Delete` / `Backspace` | **Delete the note** (`deleteNote(api, note.id)`) | Falls through to the textarea so the user can erase characters |

The Delete/Backspace path early-returns if `document.activeElement` is an `<input>`, `<textarea>` or contentEditable — so typing in any host input field never accidentally deletes a sticky note. After delete, `NotesOverlay`'s "drop selection if its note disappears" effect auto-clears the selection.

## Viewport math + zero-lag camera follow

All coords inside the plugin are **world** units, matching the host's canvas coordinate system. Conversion lives in `store/viewport.ts`:

```
screen.x = (world.x + offset.x) * zoom
screen.y = (world.y + offset.y) * zoom
```

### Why notes stay in lock-step with the canvas

Earlier the plugin used React state for viewport (`setViewport(readViewport(api))` from a `subscribeToViewport` callback). That approach had ~1 frame of lag behind the canvas (Redux update → React state update → re-render → useLayoutEffect → DOM mutation). Visible as "notes drag behind canvas during panning".

The current architecture eliminates that lag entirely:

1. **No viewport React state.** `NotesOverlay` does NOT subscribe to viewport. It only subscribes to project / view-mode / drawing-mode changes, which trigger re-renders for chrome visibility, mounting/unmounting, etc.
2. **Each `Note` runs an `applyFrame(vp)` callback every animation frame.** Inside it:
   - Reads the latest `noteRef.current` (mirror of `note` prop) and any transient `sessionRef` state from an in-progress drag/resize.
   - Computes screen position from `vp` (synchronously matching the canvas's current viewport).
   - Applies `transform: translate3d(...)`, `width`, `height`, `padding`, `font-size` directly to DOM via refs (`rootRef`, `textBodyRef`, `stylingBtnContainerRef`, `popupContainerRef`, `textareaRef`).
3. **The frame loop is owned by the host (`api.subscribeToViewportFrame(cb)`).** A SINGLE shared `requestAnimationFrame` loop in the host fans out to every subscriber across every canvas-overlay plugin — so 50 notes pay the cost of one rAF callback, not 50. The loop auto-stops when there are no subscribers and auto-starts on the next subscription.
4. **Fallback for older hosts.** If `api.subscribeToViewportFrame` is missing, each `Note` runs its own per-instance `requestAnimationFrame` loop and reads `api.getViewport()` itself. Same behaviour, slightly worse perf at scale.
5. **All rAF callbacks for one frame run together** — canvas, drawing layer, and the host's overlay-frame loop — before the browser paints. The note's transform reaches the compositor in the same frame as the canvas's render. **Zero perceptible lag.**
6. **Skip-if-unchanged inside `applyFrame`.** The closure tracks `lastZoom` / `lastOx` / `lastOy` / `lastTransient` / `dirtyRef` and only mutates DOM when viewport changed (or a drag/resize session is active, or a React-driven dirty flag is set). 60fps idle cycles cost ~one comparison + function call.
7. **GPU-accelerated movement.** Position is applied via `transform` + `willChange: 'transform'` so panning doesn't trigger layout — only compositor recomposites.

### Drag / resize during pan

Pointer handlers also use `readViewport(api)` directly (no `viewport` prop) — the world-space delta is always computed against the current camera. Drag mutations live in `sessionRef`; the rAF loop reads them directly without React state churn.

### Initial transform on mount

To avoid a one-frame flash from `translate3d(0,0,0)` before the first rAF tick, the React render computes an `initSx/initSy/initSw/initSh/initFsCss` from `readViewport(api)` and applies them inline. The rAF loop overwrites within the next frame.

### Wheel forwarding

Every `pointer-events: auto` surface owned by a note (root, styling button container, styling popup container) acts as a wheel sink — without intervention, the moment the cursor crosses any of them the canvas's wheel listener stops firing and panning halts.

Each `Note` calls `attachWheelForwarding(api, element)` for ALL THREE refs (`rootRef`, `stylingBtnContainerRef`, `popupContainerRef`). That helper:

1. Prefers `api.attachCanvasWheelForwarding(element)` from the host (added in host >= 2026-05-06). The host owns the canvas-element lookup and the wheel re-dispatch — plugins never reach into the host DOM with `document.querySelector` themselves.
2. Falls back to a plugin-local non-passive `{ passive: false }` `wheel` listener that finds the canvas via `api.getCanvasElement()` (also new) or, last resort, `document.querySelector('main canvas')`. The fallback is used on older hosts.

In both branches the dispatched event is a synthetic `WheelEvent` with `delta*` / `client*` / `screen*` / modifier keys forwarded verbatim. Synthetic events are untrusted (`isTrusted: false`) but the host's listener only reads those properties.

Listener attachment for the styling button + popup containers re-runs on `[api, showChrome, popupOpen]` so the listener is always bound to the live DOM node (both containers are conditionally mounted).

`onIconClick` uses `viewportCenterWorld(vp)` to drop new notes at the visible center.

## Mobile / touch support

The plugin uses `PointerEvent` (`onPointerDown`, `pointermove`, `pointerup`) which natively handles mouse, touch, and pen — no separate touch-event branch is needed. Two device-specific concerns are addressed explicitly:

### Touch action

Mobile browsers default to interpreting a touch + drag on any element as a page-scroll / pinch-zoom gesture, which silently steals the `pointermove` events from our drag handler. Every interactive surface in archon-note sets `touch-action: none` to opt out:

| Element | Why |
|---|---|
| Note root (when `interactive`) | drag-to-move uses `pointermove` |
| Resize handle hit-area | drag-to-resize uses `pointermove` |
| Delete button | tap to delete |
| Styling button | tap to open popup |
| Styling popup | tap to pick color / font |

When the note is in view-mode or drawing-mode, `touchAction` reverts to `auto` on the root so touches pass through to the canvas naturally.

### Hit targets

Visible chrome stays small (Miro-like, fits compact notes), but each interactive element has an enlarged transparent hit-area for fingers:

| Element | Hit area | Visible |
|---|---|---|
| Resize handle | `RESIZE_HANDLE_HIT_SIZE = 28 × 28` CSS px | `RESIZE_HANDLE_VISIBLE_SIZE = 10 × 10` |
| Delete button | `DELETE_BUTTON_HIT_SIZE = 32 × 32` | `DELETE_BUTTON_VISIBLE_SIZE = 20 × 20` |
| Styling button | `STYLING_BUTTON_SIZE = 28 × 28` (no separate hit area — visible IS the target) | same |

The pattern: the outer hit-area receives the pointer event; the inner visual element has `pointer-events: none` so taps on the transparent padding still go to the outer wrapper.

### Async font loading

`fitText` measures text via canvas-2d `measureText`, which uses the **currently loaded font**. `Permanent Marker` (and its `Caveat` cyrillic fallback) load asynchronously from Google Fonts — on the very first paint, especially on mobile, the canvas measures with the system fallback's metrics while the actual rendered text uses the just-arrived custom font. Result: noticeably mis-sized glyphs until the next render trigger.

Each `Note` waits for `document.fonts.ready` AND specifically `document.fonts.load('400 16px "Permanent Marker"')` / `document.fonts.load('400 16px "Caveat"')`, then bumps `dirtyRef.current = true`. The next rAF tick re-runs `fitText` with correct metrics and applies the right `fontSize` / textarea height. From the user's perspective the text "snaps" once to its final size as soon as the fonts finish downloading — typically within the first second on a fresh load, instant on subsequent loads (HTTP cache).

## Dynamic font sizing (`utils/fitText.ts`)

Binary search the integer range `[MIN_FIT_FONT_SIZE, MAX_FIT_FONT_SIZE]`. For each candidate, build a CSS font string from `FONT_STACKS` + `FONT_WEIGHT` + `FONT_STYLE`, set it on a singleton offscreen canvas-2d context, wrap text into the inner box (`size - 2*NOTE_PADDING`) using greedy word-wrap, sum line heights with `LINE_HEIGHT_MULTIPLIER = 1.2`. The largest font that fits wins.

**Vertical buffer**: `VERTICAL_BUFFER_LINES = 4` line-heights are reserved as empty top + bottom space (2 above + 2 below the text). The constraint `totalTextHeight ≤ innerHeight − 4 * lineHeight` is what the binary search optimises against. The remaining buffer becomes natural breathing room around the centered text — the note never feels cramped, the caret on an empty note is readable but not aggressively huge.

**Empty text is sized as a single character** (probe = `'M'`). With the vertical buffer in place a default-sized 220×220 note's empty caret lands around `~32-36 px` (capped by `MAX_FIT_FONT_SIZE = 96`), giving the user an obvious "type here" target without feeling overwhelming. As soon as content is added the size recomputes.

## Editor centering

The textarea is auto-sized in `Note.tsx` via a `useLayoutEffect` that runs after `fontSizeWorld` and `effectiveSize` are computed:

```ts
ta.style.height = 'auto';
const cap = ta.parentElement?.clientHeight ?? Infinity;
ta.style.height = `${Math.min(ta.scrollHeight, cap)}px`;
```

Combined with the parent flex `align-items:center`, this means:
- Empty / short text → textarea is short, parent flex centers it vertically → caret sits at the visual center of the note.
- Text grows → textarea height grows, eventually fills the parent (capped at parent's inner height so it never pushes the note open).

CSS in `fonts.css` mirrors this: `[data-archon-note-textarea]` uses `height: auto; min-height: 1em; max-height: 100%`. The JS height set via `style.height` overrides the CSS default for measurement-driven sizing.

## Integration-layer scoping

Notes are scoped to host integration layers exactly the way systems / containers / users are. Each note carries a `layerId` (`ArchonNote.layerId`) set at creation time from `api.getSelectedLayerId()`. A note is rendered ONLY when the host's currently selected layer matches its `layerId`.

### Where it happens

```
NotesOverlay.tsx
  ├── selectedLayerId state (initialised from api.getSelectedLayerId() ?? 'default-layer')
  ├── effect: api.subscribeToSelectedLayer(refresh) → re-set selectedLayerId on layer pick
  ├── visibleIds = useMemo(() => noteOrder.filter(id => notes[id].layerId === selectedLayerId))
  └── renders ONLY visibleIds
```

`noteOrder` is preserved across the filter so z-order within a layer is stable.

### Selection auto-deselect on layer switch

If the currently selected note is filtered out by a layer switch (its `layerId` no longer matches `selectedLayerId`), `NotesOverlay` clears `selection`. The styling popup, edit textarea, and any drag/resize state are torn down by the React unmount of the underlying `Note` component.

### Note creation

`onIconClick` (in `src/index.tsx`) reads `api.getSelectedLayerId()` (helper `getActiveLayerId(api)`) and tags the new note with that id. New notes always belong to whatever layer was active when the icon was clicked.

### Migration

Notes saved before `layerId` existed have `layerId === undefined` in the raw data. `normalizeNote` (in `src/store/notesStore.ts`) maps that to `'default-layer'` — the host always provisions a layer with that id, so the legacy notes show up on whatever the user's default layer is. Migration happens on read only; no rewrite to `pluginData` until the user mutates the note.

### Layer deletion behavior

If the user deletes the layer a note belongs to, the note remains in `pluginData` but becomes invisible (no layer to render it on). The host's project save/load preserves it. The uninstall confirmation still counts orphan notes (`getLayerName(api, layerId)` falls back to the raw id when the layer isn't found, so the user sees something like `auth-flow: 5 notes` instead of a friendly name).

### Host API requirements

Two optional methods on `ArchonPluginAPI` (host >= 2026-05-08): `getSelectedLayerId()` and `subscribeToSelectedLayer(cb)`. Both have fallbacks — older hosts that don't expose them will keep all notes on `'default-layer'` and never trigger the subscription, which mirrors the pre-layer behavior.

## Uninstall confirmation flow (`beforeUninstall`)

The plugin implements `ArchonPlugin.beforeUninstall(api)` (in `src/index.tsx`) so the host shows a `ConfirmModal` before deleting the plugin (and with it, every note in the project).

### Behavior

- If `pluginData.notes` is empty → returns `null` → host uninstalls silently (no modal).
- Otherwise → groups notes by `layerId`, looks up each layer's display name via `api.getProjectState().integrationLayers[layerId].name`, builds a `PluginUninstallConfirmation` with one item per layer (`{ label: layerName, detail: 'N notes' }`), and returns it. The host's `ConfirmModal` shows the items as a bulleted list. Only `Uninstall and delete notes` triggers the actual uninstall.

### Why this matters

The previous "silent" uninstall was destructive — the user could lose every note in the project with one click and no recoverable state (uninstall is not undo-able by design). The confirmation gives the user an inventory of what they're about to lose, grouped by where they live.

### Robustness

- The hook is sync and pure-read (no side effects) — safe to call multiple times.
- If the hook throws, the host logs the error and falls through to silent uninstall (refusing to uninstall on a buggy hook would trap the user).

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

The plugin only owns z-indexes inside its own overlay container (which the host mounts above the canvas). All values below are stacking context-local to that container:

| Layer                                          | z-index               |
|------------------------------------------------|-----------------------|
| Note (idle)                                    | `Z_NOTE_BASE = 1`     |
| Note (selected)                                | `Z_NOTE_SELECTED = 2` |
| Note (editing)                                 | `Z_NOTE_EDITING = 3`  |
| Styling button                                 | `Z_STYLING_BUTTON = 9`|
| Styling popup                                  | `Z_STYLING_POPUP = 10`|
| Delete button                                  | `Z_DELETE_BUTTON = 11`|

The overlay container received from `mountOverlay` is `pointer-events: none` by default so clicks pass through to whatever the host paints below; each note opts in via `pointer-events: auto` only when `interactive`.

## Adding a new feature — quick checklist

| You want to… | Files to touch |
|--------------|----------------|
| Add a new note field (e.g. `tilt`) | `types.ts` + `notesStore.ts` (initial value) + `Note.tsx` (render/use) + `DATA_MODEL.md` (schema) |
| Add a new color | `colors.ts` (`NOTE_PALETTE` + `UI_SPEC.md`) |
| Add a new interaction (e.g. arrow keys) | `Note.tsx` (state machine + handler) + `ARCHITECTURE.md` |
| Add a new host API dependency | `types.ts` `ArchonPluginAPI` mirror + corresponding host work + `HOST_CONTRACT.md` |
