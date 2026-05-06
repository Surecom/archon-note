import { ArchonPluginAPI, ViewportSnapshot } from '../types';

/**
 * Convert world coordinates to canvas-screen pixels using the host's viewport
 * formula:
 *   screen.x = (world.x + offset.x) * zoom
 *   screen.y = (world.y + offset.y) * zoom
 *
 * Inverse for screen → world is exposed via `screenToWorld`.
 */
export function worldToScreen(
  world: { x: number; y: number },
  vp: Pick<ViewportSnapshot, 'zoom' | 'offset'>,
): { x: number; y: number } {
  return {
    x: (world.x + vp.offset.x) * vp.zoom,
    y: (world.y + vp.offset.y) * vp.zoom,
  };
}

export function screenToWorld(
  screen: { x: number; y: number },
  vp: Pick<ViewportSnapshot, 'zoom' | 'offset'>,
): { x: number; y: number } {
  return {
    x: screen.x / vp.zoom - vp.offset.x,
    y: screen.y / vp.zoom - vp.offset.y,
  };
}

/**
 * The world-coordinate of the viewport center (where new notes should drop).
 * Mirrors the inverse of the host's `fitViewToCurrentLayer` math.
 */
export function viewportCenterWorld(vp: ViewportSnapshot): { x: number; y: number } {
  return screenToWorld(
    { x: vp.canvasSize.width / 2, y: vp.canvasSize.height / 2 },
    vp,
  );
}

/**
 * Defensive read: returns a zero-zoom-safe snapshot. If the host doesn't
 * implement `getViewport` (very-old build), returns a sane identity viewport
 * sized to the window.
 */
export function readViewport(api: ArchonPluginAPI): ViewportSnapshot {
  if (api.getViewport) {
    const vp = api.getViewport();
    return {
      zoom: vp.zoom > 0 ? vp.zoom : 1,
      offset: { x: vp.offset.x, y: vp.offset.y },
      canvasSize: {
        width: Math.max(1, vp.canvasSize.width),
        height: Math.max(1, vp.canvasSize.height),
      },
    };
  }
  return {
    zoom: 1,
    offset: { x: 0, y: 0 },
    canvasSize: { width: window.innerWidth, height: window.innerHeight },
  };
}
