import { FONT_STACKS, FONT_STYLE, FONT_WEIGHT, MAX_FIT_FONT_SIZE, MIN_FIT_FONT_SIZE, NOTE_PADDING } from '../constants';
import { NoteFontFamily } from '../types';

/**
 * Compute the largest font size (in WORLD units, i.e. before zoom multiplication)
 * that allows `text` to fit inside a `width × height` box with `NOTE_PADDING`
 * on all sides, using `fontFamily`.
 *
 * Algorithm: binary search the integer font-size range [MIN_FIT_FONT_SIZE,
 * MAX_FIT_FONT_SIZE]. Measurement uses an offscreen canvas-2d context for
 * width and a simple line-height multiplier for height; word-wrap is greedy
 * (split on whitespace).
 *
 * Empty text uses `MIN_FIT_FONT_SIZE` so the placeholder caret has a sensible
 * size on a brand new note.
 */

let measureCtx: CanvasRenderingContext2D | null = null;

function getCtx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const canvas = document.createElement('canvas');
    measureCtx = canvas.getContext('2d')!;
  }
  return measureCtx;
}

const LINE_HEIGHT_MULTIPLIER = 1.2;

/**
 * Number of line-heights reserved as empty top + bottom buffer when computing
 * the maximum fitting font size. With `VERTICAL_BUFFER_LINES = 4` (= 2 lines
 * of breathing room at the top + 2 at the bottom of the note's inner area),
 * fitText finds the largest font where the wrapped text fits within
 * `innerHeight - 4 * lineHeight`. The remaining buffer becomes visual
 * padding around the centered text — the note never feels cramped, the
 * caret on an empty note is readable but not aggressively huge.
 */
const VERTICAL_BUFFER_LINES = 4;

function buildFontString(fontSize: number, fontFamily: NoteFontFamily): string {
  const stack = FONT_STACKS[fontFamily];
  const style = FONT_STYLE[fontFamily];
  const weight = FONT_WEIGHT[fontFamily];
  return `${style} ${weight} ${fontSize}px ${stack}`;
}

function wrapInto(words: string[], maxWidth: number, ctx: CanvasRenderingContext2D): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word;
    const w = ctx.measureText(candidate).width;
    if (w <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Returns true if `text` fits in the given box at `fontSize`. */
function fitsAt(
  text: string,
  fontSize: number,
  fontFamily: NoteFontFamily,
  innerWidth: number,
  innerHeight: number,
): boolean {
  const ctx = getCtx();
  ctx.font = buildFontString(fontSize, fontFamily);

  const lineHeight = fontSize * LINE_HEIGHT_MULTIPLIER;
  // Reserve 2 line-heights of empty space at the top + 2 at the bottom so the
  // text never visually fills the note edge-to-edge. The font that fits the
  // remaining `effectiveHeight` is what the binary search will pick.
  const effectiveHeight = innerHeight - VERTICAL_BUFFER_LINES * lineHeight;
  if (effectiveHeight <= 0) return false;

  // Split user-entered newlines, then wrap each segment into the inner width.
  const segments = text.split(/\n/);
  const lines: string[] = [];
  for (const segment of segments) {
    if (segment.length === 0) {
      lines.push('');
      continue;
    }
    // Cheap hard-break for unbroken long words.
    const words = segment.split(/\s+/);
    if (words.length === 1) {
      // No spaces — break by characters if necessary.
      const single = words[0];
      const wholeWidth = ctx.measureText(single).width;
      if (wholeWidth <= innerWidth) {
        lines.push(single);
      } else {
        let buf = '';
        for (const ch of single) {
          const w = ctx.measureText(buf + ch).width;
          if (w <= innerWidth) buf += ch;
          else { if (buf) lines.push(buf); buf = ch; }
        }
        if (buf) lines.push(buf);
      }
    } else {
      lines.push(...wrapInto(words, innerWidth, ctx));
    }
  }

  const totalHeight = lines.length * lineHeight;
  return totalHeight <= effectiveHeight;
}

export function fitText(
  text: string,
  width: number,
  height: number,
  fontFamily: NoteFontFamily,
): number {
  const innerWidth = Math.max(1, width - NOTE_PADDING * 2);
  const innerHeight = Math.max(1, height - NOTE_PADDING * 2);

  // Empty text is sized as a single character so the caret is prominent and
  // the note immediately invites typing (per UI spec — empty == 1 char).
  // Capped at MAX_FIT_FONT_SIZE.
  const probe = !text || text.length === 0 ? 'M' : text;

  let lo = MIN_FIT_FONT_SIZE;
  let hi = MAX_FIT_FONT_SIZE;
  let best = lo;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fitsAt(probe, mid, fontFamily, innerWidth, innerHeight)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}
