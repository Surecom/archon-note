# archon-note — UI Spec

> Read this file before tweaking colors, fonts, sizes, padding, popup positioning, or any visual concern.

## Sticky note (`Note.tsx`)

- **Default size on creation**: 220 × 220 world units (`DEFAULT_NOTE_SIZE`).
- **Minimum size**: 60 × 60 world units (`MIN_NOTE_SIZE`).
- **Inner padding**: 12 world units on every side (`NOTE_PADDING`); multiplied by `viewport.zoom` when applied as CSS.
- **Border radius**: 2 px (sharp, modern look).
- **Shadow**: `0 1px 2px rgba(15, 23, 42, 0.10), 0 6px 18px rgba(15, 23, 42, 0.18)` — two layers, simulates a sticky-note lift.
- **Cursor**: `grab` when interactive in idle/selected; `text` when editing; `default` when view-mode or drawing-mode.
- **Drawing-mode opacity**: `0.55` (transition 200 ms ease).
- **Selection outline**: 1.5 px solid `#2563eb` (blue-600) inside-inset, drawn as an absolute child so it doesn't shift layout.

## Colors (`colors.ts`)

16 swatches in a 4 × 4 grid, hex values approximate the reference image. All but the last use dark text (`#1f2937`); the last (black) uses white text (`#f8fafc`).

| Row | Swatches |
|-----|----------|
| 1 | light gray, soft yellow, saturated yellow, peach |
| 2 | pale green, grass, mint green, teal mint |
| 3 | soft pink, bright pink, periwinkle, coral red |
| 4 | pale blue, sky blue, medium blue, black |

Hex values live in `colors.ts`. **Default for a new note**: `#ffd84d` (saturated yellow).

`textColorFor(hex)` returns the swatch's preferred text color, falling back to `#1f2937` for unknown hex values.

## Fonts (`fonts.css` + `constants.ts`)

Two families. The first is the OS-provided sans stack (no `@import` needed); the second is Google Font "Permanent Marker" with a Caveat fallback for cyrillic glyphs (Permanent Marker itself is latin-only).

| Family key | Stack | Style | Weight |
|------------|-------|-------|--------|
| `'sans'`   | `system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif` | normal | 600 |
| `'marker'` | `"Permanent Marker", "Caveat", "Bradley Hand", cursive`                                | normal | 400 |

Font is dynamic — size is recomputed via `utils/fitText.ts` on every render, never stored.

- `MIN_FIT_FONT_SIZE = 10`, `MAX_FIT_FONT_SIZE = 96` (in world units).
- `LINE_HEIGHT_MULTIPLIER = 1.2`.
- `VERTICAL_BUFFER_LINES = 4` — fitText reserves 2 line-heights of empty space at the top + 2 at the bottom of the inner area so text never visually fills the note edge-to-edge. The font that fits `innerHeight − 4 * lineHeight` is what the binary search picks.
- **Empty text is sized as a single character** (probe = `'M'`). With the vertical buffer in place a default 220×220 note caret lands around `~32-36 px` — readable and inviting without being overwhelming. Caps at `MAX_FIT_FONT_SIZE = 96`. As soon as the user adds more text, fitText recomputes and shrinks the size to fit the actual content.
- The textarea has no `placeholder` text — the large caret on an empty colored note is sufficient affordance.

Migration: legacy notes with `fontFamily: 'serif'` (older plugin versions) are mapped to `'marker'` on read in `store/notesStore.ts` `normalizeNote`.

## Resize handles

Two-layer design: each handle is a transparent **hit-area** (`RESIZE_HANDLE_HIT_SIZE = 28` CSS px) with a visible blue-bordered **circle** (`RESIZE_HANDLE_VISIBLE_SIZE = 10` CSS px) centered inside via flex. The hit area is what receives the pointer event; the inner circle is visual only.

- **Hit area**: 28 × 28 CSS px (mobile-friendly — comfortable finger tap target).
  - `position: absolute`, `pointer-events: auto`, `touch-action: none`, `cursor: <ns/ew/nesw/nwse>-resize`.
  - `data-archon-note-handle="<edge>"` so click-outside / `Note.tsx` body handler can ignore taps inside.
  - Anchored so the **inner circle's center** sits 15 px (`RESIZE_GRID_OFFSET`) outside every note edge: hit-area top/right/etc. = `-(RESIZE_GRID_OFFSET + RESIZE_HANDLE_HIT_SIZE / 2) = -29` CSS px. Edge midpoints are `translateX/Y -50%`-centered along the matching axis.
  - Total visible resize grid = note + `2 * RESIZE_GRID_OFFSET = 30` CSS px on each axis.
- **Visible circle**: 10 × 10 CSS px, `#ffffff` fill, 1.5 px solid `#2563eb` border, fixed pixel size (does not scale with zoom).
- Visible only in `selected` / `editing` and only when `interactive`.

The 28 × 28 NE hit area overlaps the 32 × 32 delete button hit area at the top-right corner. `Z_DELETE_BUTTON = 11` is higher than the handle's z-index (none = auto = 0), so taps in the overlap go to the delete button. The user can still grab the NE handle from its top-right corner outside the overlap.

## Delete button (`DeleteButton.tsx`)

Two-layer design (same pattern as resize handles): transparent hit-area button with the visible red circle centered inside.

- **Hit area**: `DELETE_BUTTON_HIT_SIZE = 32 × 32` CSS px transparent `<button>`. `touch-action: none`, `pointer-events: auto`, explicit `Z_DELETE_BUTTON = 11`. Anchored so its center sits exactly on the note's NE corner: `top: -16; right: -16;`.
- **Visible circle**: `DELETE_BUTTON_VISIBLE_SIZE = 20 × 20` CSS px, `#ef4444` (red-500), white border 2 px, white `X` icon (Lucide `X`, size 12, strokeWidth 3), shadow `0 2px 6px rgba(0,0,0,0.25)`.
- Visible only in `selected` / `editing`.
- **z-index**: `Z_DELETE_BUTTON = 11` ensures the button renders ABOVE the overlapping NE resize handle. Taps in the overlap go to delete; the user grabs the NE handle from its top-right tip outside the overlap.
- `data-archon-note-delete` so click-outside doesn't deselect when clicking it.

## Styling button (`StylingButton.tsx`)

Small entry-point that opens the styling popup. Visible only when a note is `selected` / `editing` AND the popup is currently closed.

- **Position**: top-center of the note, offset `STYLING_BUTTON_OFFSET = 56` CSS px above the note's top edge. With the resize grid pushed `RESIZE_GRID_OFFSET = 15` px outside, the topmost handle's outer edge sits 20 px above the note; the styling button's bottom is then 28 px above the note (56 - 28 button height) — leaving a clean ~8 px gap between the resize grid edge and the styling button.
- **Size**: `STYLING_BUTTON_SIZE = 28 × 28` CSS px (fixed, does not scale with zoom).
- **Background**: `#ffffff`, 1 px border `rgba(15, 23, 42, 0.12)`, layered shadow (`0 2px 6px / 0 1px 2px rgba(15, 23, 42, .16/.10)`).
- **Icon**: Lucide `Palette`, size 14, strokeWidth 2.2, color `#1f2937`.
- **Pointer**: stops propagation on `pointerdown` so clicking it never starts a drag.
- `data-archon-note-styling-btn` — click-outside ignores it; note `pointerdown` ignores it.

## Styling popup (`StylingPopup.tsx`)

- **Visibility**: only when a note is `selected` / `editing` AND `popupOpen=true` (set by clicking the styling button).
- **Position**: smart, computed via `utils/popupPosition.ts` — tries `above → below → right → left`, picks the first candidate that fits in the canvas viewport AND doesn't overlap the note. Falls back to "in viewport, may overlap" if nothing else fits, and finally to a clamped position so it's always visible. The popup is rendered as a sibling of the note in the React tree, in overlay-container CSS-pixel coords — so it can sit anywhere on the canvas, not just inside the note's bounds.
- **Estimated geometry**: `STYLING_POPUP_WIDTH = 252`, `STYLING_POPUP_HEIGHT = 152`, with a `STYLING_POPUP_MARGIN = 12` px gap to the note.
- **Background**: white card, 12 px border radius, layered shadow.
- **Padding**: 10 px.
- **Layout**: 4 × 4 color grid (28 px circles, 6 px gap) | 1 px divider | two `Aa` font buttons (36 × 36 px each).
- **Active swatch**: 2 px solid `#1f2937` border + Lucide `Check` icon (size 14, strokeWidth 3) inside.
- **Active font button**: dark background `#1f2937` + white `Aa` glyph; inactive: `#f3f4f6` background + dark glyph. The glyph itself uses `FONT_STACKS[family]` + `FONT_WEIGHT[family]` so the Sans Aa looks like system sans and the Marker Aa looks like Permanent Marker.
- **Pointer**: stops propagation on `pointerdown` so clicking the popup doesn't deselect the note.
- `data-archon-note-popup` so click-outside doesn't deselect when clicking it.

## Z-order (within the overlay div)

| Element | z-index |
|---------|---------|
| Note (idle)            | `Z_NOTE_BASE = 1`        |
| Note (selected)        | `Z_NOTE_SELECTED = 2`    |
| Note (editing)         | `Z_NOTE_EDITING = 3`     |
| Styling button         | `Z_STYLING_BUTTON = 9`   |
| Styling popup          | `Z_STYLING_POPUP = 10`   |
| Delete button          | `Z_DELETE_BUTTON = 11`   |

The overlay container itself sits at `z-[400]` (host).

## State visual cheat-sheet

| State    | Selection outline | Resize handles | Delete X | Styling button (closed) | Styling popup (open) |
|----------|-------------------|----------------|----------|-------------------------|----------------------|
| idle     | –   | –   | –   | –                | –                |
| selected | yes | yes | yes | yes (when popup closed) | yes (when popup open) |
| editing  | yes | yes | yes | yes (when popup closed) | yes (when popup open) |

The styling button and the styling popup are mutually exclusive — opening the popup hides the button (the popup *is* the open state).

In view mode and drawing mode, ALL chrome is hidden because the note becomes non-interactive.
