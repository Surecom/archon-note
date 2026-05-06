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

The Delete/Backspace path early-returns if `document.activeElement` is an `<input>`, `<textarea>` or contentEditable — so typing in the host's right panel never accidentally deletes a sticky note. After delete, `NotesOverlay`'s "drop selection if its note disappears" effect auto-clears the selection.

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
2. **Each `Note` runs its own rAF loop.** Inside the loop:
   - Reads the current viewport synchronously via `api.getViewport()`.
   - Computes screen position with the latest `noteRef.current` (mirror of `note` prop) and any transient `sessionRef` state from an in-progress drag/resize.
   - Applies `transform: translate3d(...)`, `width`, `height`, `padding`, `font-size` directly to DOM via refs (`rootRef`, `textBodyRef`, `stylingBtnContainerRef`, `popupContainerRef`, `textareaRef`).
3. **All rAF callbacks for one frame run together** — canvas, drawing layer, and notes — before the browser paints. The note's transform reaches the compositor in the same frame as the canvas's render. **Zero perceptible lag.**
4. **Skip-if-unchanged inside the loop.** The closure tracks `lastZoom` / `lastOx` / `lastOy` and only mutates DOM when viewport changed (or a drag/resize session is active). 60fps cycles cost ~one comparison and a function call when nothing changed.
5. **GPU-accelerated movement.** Position is applied via `transform` + `willChange: 'transform'` so panning doesn't trigger layout — only compositor recomposites.

### Drag / resize during pan

Pointer handlers also use `readViewport(api)` directly (no `viewport` prop) — the world-space delta is always computed against the current camera. Drag mutations live in `sessionRef`; the rAF loop reads them directly without React state churn.

### Initial transform on mount

To avoid a one-frame flash from `translate3d(0,0,0)` before the first rAF tick, the React render computes an `initSx/initSy/initSw/initSh/initFsCss` from `readViewport(api)` and applies them inline. The rAF loop overwrites within the next frame.

### Wheel forwarding

Every `pointer-events: auto` surface owned by a note (root, styling button container, styling popup container) acts as a wheel sink — without intervention, the moment the cursor crosses any of them the canvas's wheel listener stops firing and panning halts.

Each `Note` attaches a non-passive `wheel` listener (`{ passive: false }`) to ALL THREE of those refs (`rootRef`, `stylingBtnContainerRef`, `popupContainerRef`) and re-dispatches a fresh `WheelEvent` on the host's `<canvas>` element via the shared `forwardWheelToCanvas(e)` helper. The host's `useCanvasCamera` wheel listener fires as if the wheel had landed on the canvas; `e.preventDefault()` blocks the browser's default scroll. Synthetic events are untrusted (`isTrusted: false`) but the host's listener only reads `delta*` / `client*` / modifier keys — all of which we forward verbatim.

Listener attachment for the styling button + popup containers re-runs on `[showChrome, popupOpen]` so the listener is always bound to the live DOM node (both containers are conditionally mounted).

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
