/**
 * Sticky-note background palette (16 swatches in a 4x4 grid).
 * Hex values are my own approximations of the swatches in the design
 * reference image — picked to give the user a balanced spectrum of pale
 * pastels for light text and one dark color for white text.
 */

export interface SwatchInfo {
  hex: string;
  /** preferred text color when this is the background */
  textColor: string;
}

export const NOTE_PALETTE: ReadonlyArray<SwatchInfo> = [
  // Row 1 — neutral / warm yellows / orange
  { hex: '#eef0f4', textColor: '#1f2937' }, // light gray
  { hex: '#fff5a3', textColor: '#1f2937' }, // soft yellow
  { hex: '#ffd84d', textColor: '#1f2937' }, // saturated yellow
  { hex: '#ffb070', textColor: '#1f2937' }, // peach
  // Row 2 — greens / mint
  { hex: '#cdeaa0', textColor: '#1f2937' }, // pale green
  { hex: '#a3d977', textColor: '#1f2937' }, // grass
  { hex: '#7ed3a3', textColor: '#1f2937' }, // mint green
  { hex: '#9adfd1', textColor: '#1f2937' }, // teal mint
  // Row 3 — pinks / purples / red
  { hex: '#f5c5e6', textColor: '#1f2937' }, // soft pink
  { hex: '#e98ad1', textColor: '#1f2937' }, // bright pink
  { hex: '#a08cf3', textColor: '#1f2937' }, // periwinkle
  { hex: '#ee7e7e', textColor: '#1f2937' }, // coral red
  // Row 4 — blues / black
  { hex: '#bcc9f5', textColor: '#1f2937' }, // pale blue
  { hex: '#a3d4f5', textColor: '#1f2937' }, // sky blue
  { hex: '#7ea7e8', textColor: '#1f2937' }, // medium blue
  { hex: '#101010', textColor: '#f8fafc' }, // black (white text)
];

/** Initial color used when a new note is created — saturated yellow (Miro default). */
export const DEFAULT_NOTE_COLOR = '#ffd84d';

/** Lookup the optimal text color for a given background. Falls back to dark text. */
export function textColorFor(bgHex: string): string {
  const swatch = NOTE_PALETTE.find(s => s.hex.toLowerCase() === bgHex.toLowerCase());
  return swatch?.textColor ?? '#1f2937';
}
