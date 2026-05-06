import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArchonNote, ArchonPluginAPI, ViewportSnapshot } from '../types';
import { textColorFor } from '../colors';
import {
  DRAG_THRESHOLD_PX,
  FONT_STACKS,
  FONT_STYLE,
  FONT_WEIGHT,
  MIN_NOTE_SIZE,
  NOTE_PADDING,
  RESIZE_GRID_OFFSET,
  RESIZE_HANDLE_HIT_SIZE,
  RESIZE_HANDLE_VISIBLE_SIZE,
  STYLING_BUTTON_OFFSET,
  STYLING_BUTTON_SIZE,
  TEXT_COMMIT_DEBOUNCE_MS,
  Z_NOTE_BASE,
  Z_NOTE_EDITING,
  Z_NOTE_SELECTED,
  Z_STYLING_BUTTON,
  Z_STYLING_POPUP,
} from '../constants';
import { fitText } from '../utils/fitText';
import { computePopupPosition } from '../utils/popupPosition';
import { readViewport } from '../store/viewport';
import { bringToFront, deleteNote, updateNote } from '../store/notesStore';
import DeleteButton from './DeleteButton';
import StylingButton from './StylingButton';
import StylingPopup from './StylingPopup';

type NoteState = 'idle' | 'selected' | 'editing';
type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface Props {
  note: ArchonNote;
  isViewMode: boolean;
  isDrawingMode: boolean;
  state: NoteState;
  popupOpen: boolean;
  api: ArchonPluginAPI;
  onRequestSelect(): void;
  onRequestEdit(): void;
  onRequestDeselect(): void;
  onTogglePopup(): void;
  onClosePopup(): void;
}

interface DragSession {
  mode: 'click-or-drag' | 'drag' | 'resize';
  edge?: ResizeEdge;
  startScreen: { x: number; y: number };
  origPos: { x: number; y: number };
  origSize: { width: number; height: number };
  /** transient (preview) values during the drag — committed on pointerup. */
  curPos: { x: number; y: number };
  curSize: { width: number; height: number };
  pointerId: number;
}

const RESIZE_EDGES: ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const RESIZE_CURSORS: Record<ResizeEdge, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
};

/**
 * Position the resize HANDLE'S HIT AREA so the visible circle (centered
 * inside the hit area via flex) lines up exactly `RESIZE_GRID_OFFSET` outside
 * the corresponding note edge. `hitSize` here is the OUTER hit area size
 * (`RESIZE_HANDLE_HIT_SIZE`), not the visible circle size — the visible
 * circle's center is what we want at `-RESIZE_GRID_OFFSET`, and centering it
 * inside the hit area means the hit area's top/right/etc. is at
 * `-(RESIZE_GRID_OFFSET + hitSize / 2)`.
 */
function resizeHandleRect(edge: ResizeEdge, hitSize: number): React.CSSProperties {
  const halfHit = hitSize / 2;
  const out = -(RESIZE_GRID_OFFSET + halfHit);
  switch (edge) {
    case 'n':  return { top: out, left: '50%', transform: 'translateX(-50%)' };
    case 's':  return { bottom: out, left: '50%', transform: 'translateX(-50%)' };
    case 'e':  return { right: out, top: '50%', transform: 'translateY(-50%)' };
    case 'w':  return { left: out, top: '50%', transform: 'translateY(-50%)' };
    case 'ne': return { top: out, right: out };
    case 'nw': return { top: out, left: out };
    case 'se': return { bottom: out, right: out };
    case 'sw': return { bottom: out, left: out };
  }
}

/**
 * Attach a wheel-forwarding listener to `element`. Prefers the host's
 * `api.attachCanvasWheelForwarding(element)` when available (host >= 2026-05-06);
 * falls back to a plugin-local implementation that locates the canvas via
 * `document.querySelector('main canvas')` for older hosts.
 *
 * Returns the unsubscribe function in both branches.
 */
function attachWheelForwarding(api: ArchonPluginAPI, element: HTMLElement): () => void {
  if (api.attachCanvasWheelForwarding) {
    return api.attachCanvasWheelForwarding(element);
  }
  // Fallback: replicate the host helper locally for older hosts.
  const handler = (e: WheelEvent) => {
    const canvas = (api.getCanvasElement?.() ?? document.querySelector('main canvas')) as HTMLCanvasElement | null;
    if (!canvas) return;
    e.preventDefault();
    e.stopPropagation();
    canvas.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      deltaZ: e.deltaZ,
      deltaMode: e.deltaMode,
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
    }));
  };
  element.addEventListener('wheel', handler, { passive: false });
  return () => element.removeEventListener('wheel', handler);
}

function applyResize(
  edge: ResizeEdge,
  origPos: { x: number; y: number },
  origSize: { width: number; height: number },
  worldDx: number,
  worldDy: number,
): { pos: { x: number; y: number }; size: { width: number; height: number } } {
  let { x, y } = origPos;
  let { width, height } = origSize;

  if (edge.includes('e')) width = Math.max(MIN_NOTE_SIZE.width, origSize.width + worldDx);
  if (edge.includes('s')) height = Math.max(MIN_NOTE_SIZE.height, origSize.height + worldDy);
  if (edge.includes('w')) {
    const newW = Math.max(MIN_NOTE_SIZE.width, origSize.width - worldDx);
    x = origPos.x + (origSize.width - newW);
    width = newW;
  }
  if (edge.includes('n')) {
    const newH = Math.max(MIN_NOTE_SIZE.height, origSize.height - worldDy);
    y = origPos.y + (origSize.height - newH);
    height = newH;
  }
  return { pos: { x, y }, size: { width, height } };
}

const Note: React.FC<Props> = ({
  note,
  isViewMode,
  isDrawingMode,
  state,
  popupOpen,
  api,
  onRequestSelect,
  onRequestEdit,
  onRequestDeselect,
  onTogglePopup,
  onClosePopup,
}) => {
  // Refs to every DOM node the rAF loop needs to mutate.
  const rootRef = useRef<HTMLDivElement>(null);
  const textBodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stylingBtnContainerRef = useRef<HTMLDivElement>(null);
  const popupContainerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<DragSession | null>(null);

  // Local text buffer while editing. Committed on debounce + on blur.
  const [textBuffer, setTextBuffer] = useState(note.text);
  const textCommitTimer = useRef<number | null>(null);
  const lastCommittedTextRef = useRef(note.text);

  // Mirror props/state to refs so the rAF loop reads the latest values without
  // needing the effect to be re-created (and without forcing React re-renders
  // on every viewport tick).
  const noteRef = useRef(note);                   noteRef.current = note;
  const stateRef = useRef<NoteState>(state);      stateRef.current = state;
  const textBufferRef = useRef(textBuffer);       textBufferRef.current = textBuffer;

  // Tracks the previous render's `state` so the text-sync effect can detect
  // pure state transitions (entered editing / left editing) versus mid-editing
  // text mutations.
  const prevStateRef = useRef<NoteState>(state);

  // Marks the rAF loop as "must apply once" so React-driven changes (text /
  // font / size / state / selection) trigger a fresh DOM pass even when the
  // canvas viewport is idle. Without this, the skip-if-unchanged optimisation
  // would keep applying STALE transform/font/textarea-height for any change
  // that doesn't ride on a viewport tick (typing, font picker, color picker,
  // undo/redo, etc.) and the layout would only "snap back" on the next pan or
  // resize. Set in a useEffect AFTER React commit so the very next rAF tick
  // picks it up.
  const dirtyRef = useRef(true);
  useEffect(() => {
    dirtyRef.current = true;
  }, [
    note.text,
    note.position.x, note.position.y,
    note.size.width, note.size.height,
    note.fontFamily,
    textBuffer,
    state,
    popupOpen,
  ]);

  // Mark dirty once web fonts have loaded so the rAF loop re-runs `fitText`
  // with the correct metrics. Without this, the very first paint sizes text
  // using fallback-font metrics (Permanent Marker / Caveat are async-loaded
  // from Google Fonts) and the rendered glyphs end up slightly mis-sized
  // until the user happens to trigger another change. Critical on mobile
  // where fonts often haven't finished loading by initial paint.
  useEffect(() => {
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    let cancelled = false;
    const bump = () => {
      if (!cancelled) dirtyRef.current = true;
    };
    document.fonts.ready.then(bump);
    // Specifically wait for the two custom faces archon-note bundles via CSS.
    Promise.allSettled([
      document.fonts.load('400 16px "Permanent Marker"'),
      document.fonts.load('400 16px "Caveat"'),
    ]).then(bump);
    return () => { cancelled = true; };
  }, []);

  const interactive = !isViewMode && !isDrawingMode;
  const showChrome = (state === 'selected' || state === 'editing') && interactive;

  // ------------------------------------------------------------------
  // Text editing — sync buffer with note.text on entering editing mode.
  // The textarea itself is rendered in BOTH modes (readOnly toggles), so the
  // DOM element is identical and layout never shifts between display/editing.
  // ------------------------------------------------------------------

  useEffect(() => {
    const prevState = prevStateRef.current;
    prevStateRef.current = state;
    const justEntered = prevState !== 'editing' && state === 'editing';
    const justLeft = prevState === 'editing' && state !== 'editing';

    if (justEntered) {
      // Entering editing: sync buffer with current note.text, focus the
      // textarea, place caret at end. The caret-at-end + focus run ONLY here,
      // never on subsequent note.text changes — otherwise the user's caret
      // would jump to end after every debounced commit.
      setTextBuffer(note.text);
      lastCommittedTextRef.current = note.text;
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          ta.focus({ preventScroll: true });
          const len = ta.value.length;
          ta.setSelectionRange(len, len);
        }
      });
      return;
    }

    if (justLeft) {
      // Leaving editing: blur the textarea so no stray caret remains, and
      // resync the buffer with the committed text in case the last keystroke
      // never made it through the debounce.
      const ta = textareaRef.current;
      if (ta && document.activeElement === ta) ta.blur();
      if (note.text !== textBuffer) setTextBuffer(note.text);
      return;
    }

    if (state === 'editing') {
      // Already in editing mode and note.text changed:
      //  - If it matches lastCommittedTextRef, the change is OUR OWN debounced
      //    commit echoing back through Redux. textBuffer already matches it.
      //    Do NOTHING — no setTextBuffer (would be a no-op anyway), and
      //    crucially no focus/setSelectionRange (would yank the caret).
      //  - If it differs (e.g. external undo/redo), sync the buffer so the
      //    textarea displays the new text. Caret stays where the user left it.
      if (note.text !== lastCommittedTextRef.current) {
        setTextBuffer(note.text);
        lastCommittedTextRef.current = note.text;
      }
      return;
    }

    // Not editing — keep the buffer in sync with note.text so the read-only
    // textarea displays the latest content.
    if (note.text !== textBuffer) setTextBuffer(note.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, note.text]);

  useEffect(() => () => {
    if (textCommitTimer.current) window.clearTimeout(textCommitTimer.current);
  }, []);

  const commitText = useCallback((value: string) => {
    if (value === lastCommittedTextRef.current) return;
    lastCommittedTextRef.current = value;
    updateNote(api, note.id, { text: value }, 'Edit note text');
  }, [api, note.id]);

  const flushText = useCallback(() => {
    if (textCommitTimer.current) {
      window.clearTimeout(textCommitTimer.current);
      textCommitTimer.current = null;
    }
    commitText(textBuffer);
  }, [textBuffer, commitText]);

  const onTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setTextBuffer(value);
    if (textCommitTimer.current) window.clearTimeout(textCommitTimer.current);
    textCommitTimer.current = window.setTimeout(() => commitText(value), TEXT_COMMIT_DEBOUNCE_MS);
  }, [commitText]);

  // ------------------------------------------------------------------
  // Drag / resize handlers — read viewport via api.getViewport() each move
  // so they stay in sync with the canvas without a viewport prop.
  // ------------------------------------------------------------------

  const onPointerMove = useCallback((e: PointerEvent) => {
    const s = sessionRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    const dx = e.clientX - s.startScreen.x;
    const dy = e.clientY - s.startScreen.y;
    const vp = readViewport(api);

    if (s.mode === 'click-or-drag') {
      if (Math.abs(dx) >= DRAG_THRESHOLD_PX || Math.abs(dy) >= DRAG_THRESHOLD_PX) {
        s.mode = 'drag';
      }
    }

    if (s.mode === 'drag') {
      const worldDx = dx / vp.zoom;
      const worldDy = dy / vp.zoom;
      s.curPos = { x: s.origPos.x + worldDx, y: s.origPos.y + worldDy };
      // No setState — the rAF loop reads sessionRef directly.
    } else if (s.mode === 'resize' && s.edge) {
      const worldDx = dx / vp.zoom;
      const worldDy = dy / vp.zoom;
      const { pos, size } = applyResize(s.edge, s.origPos, s.origSize, worldDx, worldDy);
      s.curPos = pos;
      s.curSize = size;
    }
  }, [api]);

  const onPointerUp = useCallback((e: PointerEvent) => {
    const s = sessionRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    sessionRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';

    if (s.mode === 'click-or-drag') {
      if (state === 'idle') onRequestSelect();
      bringToFront(api, note.id);
      return;
    }
    if (s.mode === 'drag') {
      const moved = s.curPos.x !== s.origPos.x || s.curPos.y !== s.origPos.y;
      if (moved) updateNote(api, note.id, { position: s.curPos }, 'Move note');
      if (state === 'idle') onRequestSelect();
      return;
    }
    if (s.mode === 'resize') {
      const moved = s.curPos.x !== s.origPos.x || s.curPos.y !== s.origPos.y;
      const resized = s.curSize.width !== s.origSize.width || s.curSize.height !== s.origSize.height;
      if (moved || resized) {
        updateNote(api, note.id, { position: s.curPos, size: s.curSize }, 'Resize note');
      }
    }
  }, [api, note.id, onPointerMove, onRequestSelect, state]);

  const startSession = useCallback((e: React.PointerEvent, mode: 'click-or-drag' | 'resize', edge?: ResizeEdge) => {
    if (!interactive) return;
    e.preventDefault();
    sessionRef.current = {
      mode,
      edge,
      startScreen: { x: e.clientX, y: e.clientY },
      origPos: { ...note.position },
      origSize: { ...note.size },
      curPos: { ...note.position },
      curSize: { ...note.size },
      pointerId: e.pointerId,
    };
    document.body.style.userSelect = 'none';
    if (mode === 'resize' && edge) document.body.style.cursor = RESIZE_CURSORS[edge];
    else document.body.style.cursor = 'grabbing';
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [interactive, note.position, note.size, onPointerMove, onPointerUp]);

  // Click-outside handling for selected/editing → deselect
  useLayoutEffect(() => {
    if (state === 'idle') return;
    const handler = (ev: PointerEvent) => {
      const t = ev.target as Node | null;
      if (!t) return;
      if (rootRef.current?.contains(t)) return;
      const tEl = t as HTMLElement;
      if (tEl.closest?.('[data-archon-note-popup]')) return;
      if (tEl.closest?.('[data-archon-note-delete]')) return;
      if (tEl.closest?.('[data-archon-note-styling-btn]')) return;
      flushText();
      onRequestDeselect();
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [state, flushText, onRequestDeselect]);

  // Keyboard shortcuts:
  //   - ESC in editing → leave editing (commit + back to selected)
  //   - ESC in selected → deselect
  //   - Delete / Backspace in selected → delete the note
  //
  // Delete/Backspace deliberately fires only in `selected` (not `editing` —
  // there the keys must reach the textarea so the user can erase characters).
  // Skipped entirely when the active element is an editable field (input,
  // textarea, contentEditable) — typically the host's right panel — so
  // typing in those panels never accidentally deletes a sticky note.
  useEffect(() => {
    if (state === 'idle') return;
    const handler = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        if (state === 'editing') {
          flushText();
          onRequestSelect();
        } else if (state === 'selected') {
          onRequestDeselect();
        }
        return;
      }

      if (state === 'selected' && (ev.key === 'Delete' || ev.key === 'Backspace')) {
        const ae = document.activeElement as HTMLElement | null;
        if (ae) {
          const tag = ae.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA' || ae.isContentEditable) return;
        }
        ev.preventDefault();
        ev.stopPropagation();
        deleteNote(api, note.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, flushText, onRequestSelect, onRequestDeselect, api, note.id]);

  // ------------------------------------------------------------------
  // Forward wheel events to the canvas for ALL pointer-events:auto surfaces
  // owned by this note: the note root, the styling button container, and the
  // styling popup container. Without forwarding, the cursor passing over any
  // of them halts panning (wheel target = element, not canvas, so the host's
  // useCanvasCamera wheel listener doesn't fire).
  //
  // Must use addEventListener with `passive: false` — React's onWheel is
  // passive in React 18, so e.preventDefault() inside an inline handler is
  // ignored and the page would scroll behind the canvas.
  //
  // Each useEffect re-runs whenever the relevant element mounts/unmounts
  // (popup is conditional on popupOpen; styling button is conditional on
  // showChrome && !popupOpen) so listeners are always attached to the live
  // DOM node.
  // ------------------------------------------------------------------

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return attachWheelForwarding(api, root);
  }, [api]);

  useEffect(() => {
    const el = stylingBtnContainerRef.current;
    if (!el) return;
    return attachWheelForwarding(api, el);
  }, [api, showChrome, popupOpen]);

  useEffect(() => {
    const el = popupContainerRef.current;
    if (!el) return;
    return attachWheelForwarding(api, el);
  }, [api, showChrome, popupOpen]);

  // ------------------------------------------------------------------
  // Per-frame DOM apply — sole owner of all viewport-driven DOM mutations.
  // Reads viewport synchronously, applies transform/width/height/padding/
  // font-size to refs. So long as it runs every animation frame in lock-step
  // with the canvas's render loop, notes update in the SAME frame as the
  // canvas. Zero lag, zero React re-renders for camera changes.
  //
  // Driven by `api.subscribeToViewportFrame` (host >= 2026-05-06) which uses
  // a SHARED single-rAF loop across all canvas-overlay plugins. Falls back
  // to a per-Note rAF for older hosts.
  // ------------------------------------------------------------------

  useEffect(() => {
    let lastZoom = -1;
    let lastOx = NaN;
    let lastOy = NaN;
    let lastTransient = false;
    let lastTaText = '\0';
    let lastTaFsCss = -1;
    let lastTaCapH = -1;

    const applyFrame = (vp: ViewportSnapshot) => {
      const session = sessionRef.current;
      const isTransient = !!session && (session.mode === 'drag' || session.mode === 'resize');
      const viewportChanged = vp.zoom !== lastZoom || vp.offset.x !== lastOx || vp.offset.y !== lastOy;
      const dirty = dirtyRef.current;
      // Always run when:
      //  - actively dragging/resizing (transient);
      //  - just stopped (one final commit to non-transient values);
      //  - viewport changed (pan / zoom / canvas resize);
      //  - React-driven changes happened (text, font, size, state, popup) —
      //    flagged via dirtyRef.
      if (!isTransient && !lastTransient && !viewportChanged && !dirty) return;

      lastZoom = vp.zoom;
      lastOx = vp.offset.x;
      lastOy = vp.offset.y;
      lastTransient = isTransient;
      dirtyRef.current = false;

      const n = noteRef.current;
      const pos = isTransient ? session!.curPos : n.position;
      const size = (isTransient && session!.mode === 'resize') ? session!.curSize : n.size;

      const sx = (pos.x + vp.offset.x) * vp.zoom;
      const sy = (pos.y + vp.offset.y) * vp.zoom;
      const sw = size.width * vp.zoom;
      const sh = size.height * vp.zoom;

      const root = rootRef.current;
      if (root) {
        root.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
        root.style.width = `${sw}px`;
        root.style.height = `${sh}px`;
      }

      let fsCss = -1;
      const tb = textBodyRef.current;
      if (tb) {
        tb.style.padding = `${NOTE_PADDING * vp.zoom}px`;
        const text = stateRef.current === 'editing' ? textBufferRef.current : (n.text || '');
        const fsWorld = fitText(text, size.width, size.height, n.fontFamily);
        fsCss = fsWorld * vp.zoom;
        tb.style.fontSize = `${fsCss}px`;
      }

      const ta = textareaRef.current;
      if (ta && tb) {
        const text = stateRef.current === 'editing' ? textBufferRef.current : (n.text || '');
        const capH = tb.clientHeight;
        // Only force a textarea relayout when the inputs to its scrollHeight
        // actually changed (text, font CSS px, parent inner height). Reading
        // scrollHeight after style.height='auto' triggers a forced layout, so
        // we want to skip it when nothing relevant changed.
        if (text !== lastTaText || fsCss !== lastTaFsCss || capH !== lastTaCapH) {
          lastTaText = text;
          lastTaFsCss = fsCss;
          lastTaCapH = capH;
          ta.style.height = 'auto';
          ta.style.height = `${Math.min(ta.scrollHeight, capH || Infinity)}px`;
        }
      }

      const sb = stylingBtnContainerRef.current;
      if (sb) {
        const cx = sx + sw / 2;
        sb.style.transform = `translate3d(${cx - STYLING_BUTTON_SIZE / 2}px, ${sy - STYLING_BUTTON_OFFSET}px, 0)`;
      }

      const pc = popupContainerRef.current;
      if (pc) {
        const coords = computePopupPosition(
          { x: sx, y: sy, width: sw, height: sh },
          { width: vp.canvasSize.width, height: vp.canvasSize.height },
        );
        pc.style.transform = `translate3d(${coords.x}px, ${coords.y}px, 0)`;
      }
    };

    // Prefer the host's shared frame subscription (single rAF for all plugins
    // and all overlay elements); fall back to a per-Note rAF on older hosts.
    if (api.subscribeToViewportFrame) {
      return api.subscribeToViewportFrame(applyFrame);
    }
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const vp = api.getViewport?.();
      if (!vp) return;
      applyFrame(vp);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [api]);

  // ------------------------------------------------------------------
  // Initial transform — computed once per render so the first paint is at
  // the correct position (no flash from translate3d(0,0,0) before rAF runs).
  // The rAF loop overwrites this immediately.
  // ------------------------------------------------------------------

  const vpNow = readViewport(api);
  const initSx = (note.position.x + vpNow.offset.x) * vpNow.zoom;
  const initSy = (note.position.y + vpNow.offset.y) * vpNow.zoom;
  const initSw = note.size.width * vpNow.zoom;
  const initSh = note.size.height * vpNow.zoom;
  const initPaddingPx = NOTE_PADDING * vpNow.zoom;
  const initFsWorld = fitText(
    state === 'editing' ? textBuffer : (note.text || ''),
    note.size.width,
    note.size.height,
    note.fontFamily,
  );
  const initFsCss = initFsWorld * vpNow.zoom;
  const initStylingBtnCx = initSx + initSw / 2;
  const initPopupCoords = popupOpen
    ? computePopupPosition(
      { x: initSx, y: initSy, width: initSw, height: initSh },
      { width: vpNow.canvasSize.width, height: vpNow.canvasSize.height },
    )
    : { x: 0, y: 0 };

  const fg = textColorFor(note.bgColor);
  const cssZIndex = state === 'editing' ? Z_NOTE_EDITING : (state === 'selected' ? Z_NOTE_SELECTED : Z_NOTE_BASE);

  return (
    <>
      <div
        ref={rootRef}
        data-archon-note
        data-archon-note-id={note.id}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          // Initial transform / size — overwritten every frame by the rAF loop.
          transform: `translate3d(${initSx}px, ${initSy}px, 0)`,
          width: initSw,
          height: initSh,
          willChange: 'transform, width, height',
          background: note.bgColor,
          color: fg,
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.10), 0 6px 18px rgba(15, 23, 42, 0.18)',
          borderRadius: 2,
          cursor: interactive ? (state === 'editing' ? 'text' : 'grab') : 'default',
          zIndex: cssZIndex,
          pointerEvents: interactive ? 'auto' : 'none',
          opacity: isDrawingMode ? 0.55 : 1,
          transition: 'opacity 200ms ease',
          userSelect: state === 'editing' ? 'text' : 'none',
          boxSizing: 'border-box',
          // `touch-action: none` prevents mobile browsers from interpreting a
          // touch on the note as a page scroll/zoom gesture — the touch
          // reaches our pointerdown handler and starts drag instead.
          touchAction: interactive ? 'none' : 'auto',
        }}
        onPointerDown={(e) => {
          if (!interactive) return;
          if (e.button !== 0) return;
          const tEl = e.target as HTMLElement;
          if (tEl.closest('[data-archon-note-handle]')) return;
          if (tEl.closest('[data-archon-note-delete]')) return;
          if (tEl.closest('[data-archon-note-popup]')) return;
          if (tEl.closest('[data-archon-note-styling-btn]')) return;
          e.stopPropagation();
          if (popupOpen) onClosePopup();
          if (state === 'editing') return;
          startSession(e, 'click-or-drag');
        }}
        onDoubleClick={(e) => {
          if (!interactive) return;
          e.stopPropagation();
          if (state !== 'editing') onRequestEdit();
        }}
      >
        {showChrome && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              border: '1.5px solid #2563eb',
              pointerEvents: 'none',
              borderRadius: 2,
            }}
          />
        )}

        <div
          ref={textBodyRef}
          style={{
            width: '100%',
            height: '100%',
            // Initial padding/fontSize — overwritten every frame by rAF.
            padding: initPaddingPx,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            fontFamily: FONT_STACKS[note.fontFamily],
            fontStyle: FONT_STYLE[note.fontFamily],
            fontWeight: FONT_WEIGHT[note.fontFamily],
            fontSize: initFsCss,
            lineHeight: 1.2,
            color: fg,
            overflow: 'hidden',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        >
          <textarea
            ref={textareaRef}
            data-archon-note-textarea
            value={state === 'editing' ? textBuffer : (note.text || '')}
            onChange={onTextChange}
            onBlur={flushText}
            onPointerDown={(e) => { if (state === 'editing') e.stopPropagation(); }}
            onMouseDown={(e) => { if (state === 'editing') e.stopPropagation(); }}
            onClick={(e) => { if (state === 'editing') e.stopPropagation(); }}
            onKeyDown={(e) => { if (state === 'editing') e.stopPropagation(); }}
            readOnly={state !== 'editing'}
            tabIndex={state === 'editing' ? 0 : -1}
            spellCheck={false}
            style={{
              fontFamily: 'inherit',
              fontStyle: 'inherit',
              fontWeight: 'inherit',
              fontSize: 'inherit',
              lineHeight: 'inherit',
              color: 'inherit',
              textAlign: 'inherit',
              cursor: state === 'editing' ? 'text' : 'inherit',
              pointerEvents: state === 'editing' ? 'auto' : 'none',
              userSelect: state === 'editing' ? 'text' : 'none',
            }}
          />
        </div>

        {showChrome && <DeleteButton onClick={() => deleteNote(api, note.id)} />}

        {/*
          Each resize handle is a transparent hit-area (`RESIZE_HANDLE_HIT_SIZE`,
          comfortable for finger taps on phones) with the visible blue-bordered
          circle (`RESIZE_HANDLE_VISIBLE_SIZE`) centered inside via flex. The
          hit area receives the pointer event; the inner circle is visual only.
          `touch-action: none` keeps mobile browsers from converting the touch
          into a scroll gesture mid-drag.
        */}
        {showChrome && RESIZE_EDGES.map((edge) => (
          <div
            key={edge}
            data-archon-note-handle={edge}
            onPointerDown={(e) => {
              e.stopPropagation();
              startSession(e, 'resize', edge);
            }}
            style={{
              position: 'absolute',
              width: RESIZE_HANDLE_HIT_SIZE,
              height: RESIZE_HANDLE_HIT_SIZE,
              cursor: RESIZE_CURSORS[edge],
              ...resizeHandleRect(edge, RESIZE_HANDLE_HIT_SIZE),
              pointerEvents: 'auto',
              touchAction: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
            }}
          >
            <span
              aria-hidden
              style={{
                width: RESIZE_HANDLE_VISIBLE_SIZE,
                height: RESIZE_HANDLE_VISIBLE_SIZE,
                background: '#ffffff',
                border: '1.5px solid #2563eb',
                borderRadius: '50%',
                pointerEvents: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        ))}
      </div>

      {/* Styling button — sibling, transformed by rAF to follow the note. */}
      {showChrome && !popupOpen && (
        <div
          ref={stylingBtnContainerRef}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transform: `translate3d(${initStylingBtnCx - STYLING_BUTTON_SIZE / 2}px, ${initSy - STYLING_BUTTON_OFFSET}px, 0)`,
            willChange: 'transform',
            zIndex: Z_STYLING_BUTTON,
            pointerEvents: 'none',
          }}
        >
          <StylingButton onClick={onTogglePopup} />
        </div>
      )}

      {/* Styling popup — sibling with smart-positioning, transformed by rAF. */}
      {showChrome && popupOpen && (
        <div
          ref={popupContainerRef}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transform: `translate3d(${initPopupCoords.x}px, ${initPopupCoords.y}px, 0)`,
            willChange: 'transform',
            zIndex: Z_STYLING_POPUP,
            pointerEvents: 'none',
          }}
        >
          <StylingPopup
            position={{ x: 0, y: 0 }}
            bgColor={note.bgColor}
            fontFamily={note.fontFamily}
            onPickColor={(hex) => updateNote(api, note.id, { bgColor: hex }, 'Change note color')}
            onPickFont={(family) => updateNote(api, note.id, { fontFamily: family }, 'Change note font')}
          />
        </div>
      )}
    </>
  );
};

export default Note;
