import { STYLING_POPUP_HEIGHT, STYLING_POPUP_MARGIN, STYLING_POPUP_WIDTH } from '../constants';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

/**
 * Compute the best top-left position (in overlay-container CSS pixels) for
 * the styling popup given the selected note's screen rect, the popup's known
 * size, and the canvas viewport size.
 *
 * Priorities (in order):
 *   1. The popup must be fully inside the viewport.
 *   2. The popup must NOT overlap the note (so the note's text stays visible).
 *   3. Prefer placement order: above → below → right → left.
 *
 * If no candidate satisfies BOTH (1) and (2), the algorithm picks the first
 * candidate that satisfies (1) alone (popup inside viewport, may overlap).
 * If none even fits in the viewport, the best candidate is clamped to viewport
 * bounds so the popup is at least clickable.
 */
export function computePopupPosition(
  noteScreenRect: Rect,
  viewport: ViewportSize,
  popupSize: { width: number; height: number } = { width: STYLING_POPUP_WIDTH, height: STYLING_POPUP_HEIGHT },
  margin: number = STYLING_POPUP_MARGIN,
): { x: number; y: number } {
  const { width: vw, height: vh } = viewport;
  const { width: pw, height: ph } = popupSize;
  const n = noteScreenRect;

  // Candidate top-left positions (for non-vertical sides, center along the matching axis).
  const noteCenterX = n.x + n.width / 2;
  const noteCenterY = n.y + n.height / 2;

  type Candidate = { name: string; x: number; y: number };

  const candidates: Candidate[] = [
    // ABOVE: centered horizontally on the note, sitting above its top edge.
    { name: 'above', x: noteCenterX - pw / 2, y: n.y - ph - margin },
    // BELOW: centered horizontally, sitting below the bottom edge.
    { name: 'below', x: noteCenterX - pw / 2, y: n.y + n.height + margin },
    // RIGHT: centered vertically, sitting to the right of the note.
    { name: 'right', x: n.x + n.width + margin, y: noteCenterY - ph / 2 },
    // LEFT: centered vertically, sitting to the left of the note.
    { name: 'left', x: n.x - pw - margin, y: noteCenterY - ph / 2 },
  ];

  const inViewport = (c: Candidate) =>
    c.x >= 0 && c.y >= 0 && c.x + pw <= vw && c.y + ph <= vh;

  const overlapsNote = (c: Candidate) =>
    c.x < n.x + n.width && c.x + pw > n.x &&
    c.y < n.y + n.height && c.y + ph > n.y;

  // Pass 1: in viewport AND no overlap, preserving candidate order.
  for (const c of candidates) {
    if (inViewport(c) && !overlapsNote(c)) return { x: c.x, y: c.y };
  }

  // Pass 2: in viewport (overlap allowed).
  for (const c of candidates) {
    if (inViewport(c)) return { x: c.x, y: c.y };
  }

  // Pass 3: best-effort — clamp the "above" candidate to viewport so the popup
  // is at least visible and clickable. This only triggers on extremely small
  // viewports where nothing fits naturally.
  const fallback = candidates[0];
  return {
    x: Math.max(0, Math.min(fallback.x, vw - pw)),
    y: Math.max(0, Math.min(fallback.y, vh - ph)),
  };
}
