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
export const MIN_FIT_FONT_SIZE = 10;
export const MAX_FIT_FONT_SIZE = 96;

/** Default font for a brand-new note. */
export const DEFAULT_FONT_FAMILY: NoteFontFamily = 'sans';

/** CSS font-family stacks. Both stacks include cyrillic-capable fallbacks. */
export const FONT_STACKS: Record<NoteFontFamily, string> = {
  sans: '"Open Sans", "Inter", "Manrope", system-ui, -apple-system, "Segoe UI", sans-serif',
  serif: '"PT Serif", Georgia, "Times New Roman", serif',
};

/** When `serif` is active we render the text in italic, like the design reference. */
export const FONT_STYLE: Record<NoteFontFamily, 'normal' | 'italic'> = {
  sans: 'normal',
  serif: 'italic',
};

/** Debounce window (ms) for committing text edits to undo history. */
export const TEXT_COMMIT_DEBOUNCE_MS = 300;

/** Z-indexes inside the overlay. The container itself is z-[400] in the host. */
export const Z_NOTE_BASE = 1;
export const Z_NOTE_SELECTED = 2;
export const Z_NOTE_EDITING = 3;
export const Z_STYLING_POPUP = 10;
export const Z_DELETE_BUTTON = 11;
