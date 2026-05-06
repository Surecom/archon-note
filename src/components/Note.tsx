import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArchonNote, ArchonPluginAPI, ViewportSnapshot } from '../types';
import { textColorFor } from '../colors';
import {
  DRAG_THRESHOLD_PX,
  FONT_STACKS,
  FONT_STYLE,
  MIN_NOTE_SIZE,
  NOTE_PADDING,
  TEXT_COMMIT_DEBOUNCE_MS,
  Z_NOTE_BASE,
  Z_NOTE_EDITING,
  Z_NOTE_SELECTED,
  Z_STYLING_POPUP,
} from '../constants';
import { fitText } from '../utils/fitText';
import { worldToScreen } from '../store/viewport';
import { bringToFront, deleteNote, updateNote } from '../store/notesStore';
import DeleteButton from './DeleteButton';
import StylingPopup from './StylingPopup';

type NoteState = 'idle' | 'selected' | 'editing';
type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface Props {
  note: ArchonNote;
  viewport: ViewportSnapshot;
  isViewMode: boolean;
  isDrawingMode: boolean;
  state: NoteState;
  api: ArchonPluginAPI;
  onRequestSelect(): void;
  onRequestEdit(): void;
  onRequestDeselect(): void;
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

function resizeHandleRect(edge: ResizeEdge, size: number): React.CSSProperties {
  const half = size / 2;
  switch (edge) {
    case 'n':  return { top: -half, left: '50%', transform: 'translateX(-50%)' };
    case 's':  return { bottom: -half, left: '50%', transform: 'translateX(-50%)' };
    case 'e':  return { right: -half, top: '50%', transform: 'translateY(-50%)' };
    case 'w':  return { left: -half, top: '50%', transform: 'translateY(-50%)' };
    case 'ne': return { top: -half, right: -half };
    case 'nw': return { top: -half, left: -half };
    case 'se': return { bottom: -half, right: -half };
    case 'sw': return { bottom: -half, left: -half };
  }
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
  viewport,
  isViewMode,
  isDrawingMode,
  state,
  api,
  onRequestSelect,
  onRequestEdit,
  onRequestDeselect,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sessionRef = useRef<DragSession | null>(null);
  // Transient overrides during drag/resize so we don't dispatch on every move.
  const [transient, setTransient] = useState<{ pos?: { x: number; y: number }; size?: { width: number; height: number } } | null>(null);
  // Local text buffer while editing. Committed on debounce + on blur.
  const [textBuffer, setTextBuffer] = useState(note.text);
  const textCommitTimer = useRef<number | null>(null);
  const lastCommittedTextRef = useRef(note.text);

  const interactive = !isViewMode && !isDrawingMode;
  const editable = state === 'editing' && interactive;

  // Sync text buffer when entering editing or when note.text changes externally.
  useEffect(() => {
    if (state === 'editing') {
      setTextBuffer(note.text);
      lastCommittedTextRef.current = note.text;
      // Focus + caret-at-end after layout
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          ta.focus({ preventScroll: true });
          const len = ta.value.length;
          ta.setSelectionRange(len, len);
        }
      });
    } else if (note.text !== textBuffer) {
      setTextBuffer(note.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, note.text]);

  // Commit pending text on debounce or unmount.
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

  // ---------- Drag / resize ----------

  const onPointerMove = useCallback((e: PointerEvent) => {
    const s = sessionRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    const dx = e.clientX - s.startScreen.x;
    const dy = e.clientY - s.startScreen.y;

    if (s.mode === 'click-or-drag') {
      if (Math.abs(dx) >= DRAG_THRESHOLD_PX || Math.abs(dy) >= DRAG_THRESHOLD_PX) {
        s.mode = 'drag';
      }
    }

    if (s.mode === 'drag') {
      const worldDx = dx / viewport.zoom;
      const worldDy = dy / viewport.zoom;
      s.curPos = { x: s.origPos.x + worldDx, y: s.origPos.y + worldDy };
      setTransient({ pos: s.curPos });
    } else if (s.mode === 'resize' && s.edge) {
      const worldDx = dx / viewport.zoom;
      const worldDy = dy / viewport.zoom;
      const { pos, size } = applyResize(s.edge, s.origPos, s.origSize, worldDx, worldDy);
      s.curPos = pos;
      s.curSize = size;
      setTransient({ pos, size });
    }
  }, [viewport.zoom]);

  const onPointerUp = useCallback((e: PointerEvent) => {
    const s = sessionRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    sessionRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';

    if (s.mode === 'click-or-drag') {
      // pure click — promote to selection
      setTransient(null);
      if (state === 'idle') onRequestSelect();
      bringToFront(api, note.id);
      return;
    }

    if (s.mode === 'drag') {
      const moved = s.curPos.x !== s.origPos.x || s.curPos.y !== s.origPos.y;
      setTransient(null);
      if (moved) {
        updateNote(api, note.id, { position: s.curPos }, 'Move note');
      }
      if (state === 'idle') onRequestSelect();
      return;
    }

    if (s.mode === 'resize') {
      const moved = s.curPos.x !== s.origPos.x || s.curPos.y !== s.origPos.y;
      const resized = s.curSize.width !== s.origSize.width || s.curSize.height !== s.origSize.height;
      setTransient(null);
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
      // Allow clicks on the styling popup (rendered as sibling of the note).
      const tEl = t as HTMLElement;
      if (tEl.closest?.('[data-archon-note-popup]')) return;
      if (tEl.closest?.('[data-archon-note-delete]')) return;
      // Commit any pending text before deselecting.
      flushText();
      onRequestDeselect();
    };
    // Use capture so we react before the new target's own handlers.
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [state, flushText, onRequestDeselect]);

  // ESC closes editor → selected; ESC again → idle
  useEffect(() => {
    if (state === 'idle') return;
    const handler = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      if (state === 'editing') {
        flushText();
        onRequestSelect();
      } else if (state === 'selected') {
        onRequestDeselect();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, flushText, onRequestSelect, onRequestDeselect]);

  // ---------- Geometry / styles ----------

  const effectivePos = transient?.pos ?? note.position;
  const effectiveSize = transient?.size ?? note.size;
  const screen = useMemo(() => worldToScreen(effectivePos, viewport), [effectivePos, viewport]);
  const screenW = effectiveSize.width * viewport.zoom;
  const screenH = effectiveSize.height * viewport.zoom;

  const fontSizeWorld = useMemo(() => {
    const text = state === 'editing' ? textBuffer : note.text;
    return fitText(text, effectiveSize.width, effectiveSize.height, note.fontFamily);
  }, [state, textBuffer, note.text, note.fontFamily, effectiveSize.width, effectiveSize.height]);

  const fg = textColorFor(note.bgColor);
  const cssZIndex = state === 'editing' ? Z_NOTE_EDITING : (state === 'selected' ? Z_NOTE_SELECTED : Z_NOTE_BASE);
  const showChrome = (state === 'selected' || state === 'editing') && interactive;

  const handlePxSize = 10;

  return (
    <div
      ref={rootRef}
      data-archon-note
      data-archon-note-id={note.id}
      style={{
        position: 'absolute',
        left: screen.x,
        top: screen.y,
        width: screenW,
        height: screenH,
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
      }}
      onPointerDown={(e) => {
        if (!interactive) return;
        // Right-click and middle-click pass through.
        if (e.button !== 0) return;
        // Resize handles & popup buttons stop propagation themselves.
        if ((e.target as HTMLElement).closest('[data-archon-note-handle]')) return;
        if ((e.target as HTMLElement).closest('[data-archon-note-delete]')) return;
        if ((e.target as HTMLElement).closest('[data-archon-note-popup]')) return;
        // In editing mode, pointer events go to the textarea — but we still stop
        // the click-outside handler from collapsing the editor.
        e.stopPropagation();
        if (state === 'editing') return;
        startSession(e, 'click-or-drag');
      }}
      onDoubleClick={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        if (state !== 'editing') onRequestEdit();
      }}
    >
      {/* selection outline */}
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

      {/* text body */}
      <div
        style={{
          width: '100%',
          height: '100%',
          padding: NOTE_PADDING * viewport.zoom,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          fontFamily: FONT_STACKS[note.fontFamily],
          fontStyle: FONT_STYLE[note.fontFamily],
          fontWeight: 600,
          fontSize: fontSizeWorld * viewport.zoom,
          lineHeight: 1.2,
          color: fg,
          overflow: 'hidden',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
        }}
      >
        {state === 'editing' ? (
          <textarea
            ref={textareaRef}
            data-archon-note-textarea
            value={textBuffer}
            onChange={onTextChange}
            onBlur={flushText}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Note"
            style={{
              fontFamily: 'inherit',
              fontStyle: 'inherit',
              fontWeight: 'inherit',
              fontSize: 'inherit',
              lineHeight: 'inherit',
              color: 'inherit',
              textAlign: 'inherit',
            }}
          />
        ) : (
          <span style={{ width: '100%' }}>{note.text || ''}</span>
        )}
      </div>

      {/* delete button */}
      {showChrome && (
        <DeleteButton
          onClick={() => deleteNote(api, note.id)}
        />
      )}

      {/* resize handles */}
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
            width: handlePxSize,
            height: handlePxSize,
            background: '#ffffff',
            border: '1.5px solid #2563eb',
            borderRadius: '50%',
            cursor: RESIZE_CURSORS[edge],
            ...resizeHandleRect(edge, handlePxSize),
            pointerEvents: 'auto',
          }}
        />
      ))}

      {/* styling popup — anchored just above the note (positioned by overlay parent) */}
      {showChrome && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: -56,
            zIndex: Z_STYLING_POPUP,
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
    </div>
  );
};

export default Note;
