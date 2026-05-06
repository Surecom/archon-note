import { NoteFontFamily } from './types';

/** Default size (in world units) for a brand-new note. */
export const DEFAULT_NOTE_SIZE = { width: 220, height: 220 } as const;

/** Hard floor for note dimensions — `fitText` must always have room for at least one glyph. */
export const MIN_NOTE_SIZE = { width: 60, height: 60 } as const;

/** Pointer-move threshold (CSS px) that flips a click into a drag. */
export const DRAG_THRESHOLD_PX = 5;

/** Inner padding inside a note (world units). Used by both rendering and `fitText`. */
export const NOTE_PADDING = 12;

/** Font-size search bounds (world units; multiplied by zoom for actual CSS px). */
export const MIN_FIT_FONT_SIZE = 1;
export const MAX_FIT_FONT_SIZE = 96;

/** Default font for a brand-new note. */
export const DEFAULT_FONT_FAMILY: NoteFontFamily = 'sans';

/**
 * CSS font-family stacks. Both stacks include cyrillic-capable fallbacks
 * (system fonts cover cyrillic; Permanent Marker is latin-only so we fall
 * through to Caveat → cursive for non-latin glyphs).
 */
export const FONT_STACKS: Record<NoteFontFamily, string> = {
  sans: 'system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
  marker: '"Permanent Marker", "Caveat", "Bradley Hand", cursive',
};

/** Font style per family. Permanent Marker already looks hand-drawn — no italic needed. */
export const FONT_STYLE: Record<NoteFontFamily, 'normal' | 'italic'> = {
  sans: 'normal',
  marker: 'normal',
};

/**
 * Font weight per family. Permanent Marker only ships at weight 400; sans
 * gets 600 for slightly stronger presence on a colored background.
 */
export const FONT_WEIGHT: Record<NoteFontFamily, number> = {
  sans: 600,
  marker: 400,
};

/** Debounce window (ms) for committing text edits to undo history. */
export const TEXT_COMMIT_DEBOUNCE_MS = 300;

/** Z-indexes inside the overlay. The container itself is z-[400] in the host. */
export const Z_NOTE_BASE = 1;
export const Z_NOTE_SELECTED = 2;
export const Z_NOTE_EDITING = 3;
export const Z_STYLING_BUTTON = 9;
export const Z_STYLING_POPUP = 10;
export const Z_DELETE_BUTTON = 11;

// ---------- Resize grid ----------

/**
 * Distance (CSS px) the resize grid is pushed outside the note edge on every
 * side. With `RESIZE_GRID_OFFSET = 15` the grid is `2 * 15 = 30` CSS px wider
 * AND taller than the note — handles sit clearly past the note border with a
 * visible gap (Miro / Figma style).
 */
export const RESIZE_GRID_OFFSET = 15;

// ---------- Mobile-friendly touch targets ----------

/**
 * Hit-area size (CSS px) for each resize handle. The visible circle is
 * `RESIZE_HANDLE_VISIBLE_SIZE` and is centered inside this larger transparent
 * area so touch users have a comfortable target (≥28 CSS px is the practical
 * minimum on phones — Apple HIG recommends 44 but that's too big visually).
 */
export const RESIZE_HANDLE_HIT_SIZE = 28;
export const RESIZE_HANDLE_VISIBLE_SIZE = 10;

/**
 * Same idea for the delete X button: 32×32 transparent hit area with a
 * 20×20 visible red circle centered inside.
 */
export const DELETE_BUTTON_HIT_SIZE = 32;
export const DELETE_BUTTON_VISIBLE_SIZE = 20;

// ---------- Styling popup geometry (CSS px, fixed) ----------

/** Estimated popup outer width in CSS px (4×4 color grid + Aa toggle). */
export const STYLING_POPUP_WIDTH = 252;
/** Estimated popup outer height in CSS px. */
export const STYLING_POPUP_HEIGHT = 152;
/** Margin (CSS px) between popup and note when placing it. */
export const STYLING_POPUP_MARGIN = 12;

// ---------- "Open styling" button geometry ----------

/** Button width × height in CSS px. */
export const STYLING_BUTTON_SIZE = 28;
/**
 * How far above the note's top edge (CSS px) the button is anchored. Sized so
 * the button bottom clears the resize grid (which extends `RESIZE_GRID_OFFSET`
 * outside the note plus a half-handle radius) by ~8 CSS px — looks like a
 * deliberate floating control rather than sitting on top of a handle.
 *
 * (15 grid offset + 5 half-handle + 8 gap + 28 button height = 56)
 */
export const STYLING_BUTTON_OFFSET = 56;
