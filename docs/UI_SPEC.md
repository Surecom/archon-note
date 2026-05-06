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
- **Empty text is sized as a single character** (probe = `'M'`). For a default-sized note this caps at `MAX_FIT_FONT_SIZE = 96`, which makes the caret prominent and immediately invites typing. As soon as the user adds more text, fitText recomputes and shrinks the size to fit the actual content.
- The textarea has no `placeholder` text — the large caret on an empty colored note is sufficient affordance.

Migration: legacy notes with `fontFamily: 'serif'` (older plugin versions) are mapped to `'marker'` on read in `store/notesStore.ts` `normalizeNote`.

## Resize handles

8 SVG-style circles drawn as positioned `<div>`s with `border-radius: 50%`:
- `width/height`: 10 px (CSS, fixed — does not scale with zoom).
- `background`: `#ffffff`.
- `border`: 1.5 px solid `#2563eb`.
- Cursor matches edge: `ns-resize`, `ew-resize`, `nesw-resize`, `nwse-resize`.
- Anchored 15 px (`RESIZE_GRID_OFFSET`) **outside** every note edge — handle centers sit at `-RESIZE_GRID_OFFSET` and `note + RESIZE_GRID_OFFSET` on each axis, which makes the visible resize grid `2 * RESIZE_GRID_OFFSET = 30` CSS px wider AND taller than the note. Edge midpoints are `translateX/Y -50%`-centered along the matching axis.
- Visible only in `selected` / `editing` and only when `interactive`.
- `data-archon-note-handle="<edge>"` so click-outside / `Note.tsx` body handler can ignore them.

## Delete button (`DeleteButton.tsx`)

- **Position**: `top: -10 px; right: -10 px;` of the note root — TOP-RIGHT corner, center of the button sits exactly on the note's NE corner (half inside, half outside).
- **Size**: 20 × 20 px.
- **Background**: `#ef4444` (red-500), white border 2 px, white `X` icon (Lucide `X`, size 12, strokeWidth 3).
- **Shadow**: `0 2px 6px rgba(0,0,0,0.25)`.
- **Visible only in** `selected` / `editing`.
- **z-index**: explicit `Z_DELETE_BUTTON = 11` so it renders ABOVE the NE resize handle (which sits 15 px further outside the note thanks to `RESIZE_GRID_OFFSET`).
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
