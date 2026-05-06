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

Two stacks loaded from Google Fonts with cyrillic + latin subsets:

| Family key | Stack | Style | Weight |
|------------|-------|-------|--------|
| `'sans'` | `"Open Sans", "Inter", "Manrope", system-ui, sans-serif` | normal | 600 |
| `'serif'` | `"PT Serif", Georgia, serif` | italic | 600 |

Font is dynamic — sizing is recomputed via `utils/fitText.ts` on every render, never stored.

- `MIN_FIT_FONT_SIZE = 10`, `MAX_FIT_FONT_SIZE = 96` (in world units).
- `LINE_HEIGHT_MULTIPLIER = 1.2`.
- Empty text uses `MIN_FIT_FONT_SIZE` so the placeholder caret is sensibly sized.

## Resize handles

8 SVG-style circles drawn as positioned `<div>`s with `border-radius: 50%`:
- `width/height`: 10 px (CSS, fixed — does not scale with zoom).
- `background`: `#ffffff`.
- `border`: 1.5 px solid `#2563eb`.
- Cursor matches edge: `ns-resize`, `ew-resize`, `nesw-resize`, `nwse-resize`.
- Anchored to corners and edge midpoints (translateX/Y -50%).
- Visible only in `selected` / `editing` and only when `interactive`.
- `data-archon-note-handle="<edge>"` so click-outside / `Note.tsx` body handler can ignore them.

## Delete button (`DeleteButton.tsx`)

- **Position**: `top: -10 px; right: -10 px;` of the note root (sits in the top-right corner, half outside the note).
- **Size**: 20 × 20 px.
- **Background**: `#ef4444` (red-500), white border 2 px, white `X` icon (Lucide `X`, size 12, strokeWidth 3).
- **Shadow**: `0 2px 6px rgba(0,0,0,0.25)`.
- **Visible only in** `selected` / `editing`.
- `data-archon-note-delete` so click-outside doesn't deselect when clicking it.

## Styling popup (`StylingPopup.tsx`)

- **Position**: anchored to top-left of the selected note, offset `top: -56 px` (sits above the note like a Miro popover).
- **Background**: white card, 12 px border radius, layered shadow.
- **Padding**: 10 px.
- **Layout**: 4 × 4 color grid (28 px circles, 6 px gap) | 1 px divider | two `Aa` font buttons (36 × 36 px each).
- **Active swatch**: 2 px solid `#1f2937` border + Lucide `Check` icon (size 14, strokeWidth 3) inside.
- **Active font button**: dark background `#1f2937` + white `Aa` glyph; inactive: `#f3f4f6` background + dark glyph.
- **Pointer**: stops propagation on `pointerdown` so clicking the popup doesn't deselect the note.
- `data-archon-note-popup` so click-outside doesn't deselect when clicking it.

## Z-order (within the overlay div)

| Element | z-index |
|---------|---------|
| Note (idle) | 1 |
| Note (selected) | 2 |
| Note (editing) | 3 |
| Styling popup (inside selected/editing note) | 10 |
| Delete button (inside selected/editing note) | 11 |

The overlay container itself sits at `z-[400]` (host).

## State visual cheat-sheet

| State | Selection outline | Resize handles | Delete X | Styling popup |
|-------|-------------------|----------------|----------|----------------|
| idle | – | – | – | – |
| selected | yes | yes | yes | yes |
| editing | yes | yes | yes | yes |

In view mode and drawing mode, ALL chrome is hidden because the note becomes non-interactive.
