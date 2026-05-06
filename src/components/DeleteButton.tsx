import React from 'react';
import { X } from 'lucide-react';
import { DELETE_BUTTON_HIT_SIZE, DELETE_BUTTON_VISIBLE_SIZE, Z_DELETE_BUTTON } from '../constants';

interface Props {
  onClick: (e: React.PointerEvent) => void;
}

/**
 * Red-circle X delete button anchored to the TOP-RIGHT corner of the note.
 *
 * Structure: a transparent `DELETE_BUTTON_HIT_SIZE`-square outer button
 * centered on the note's NE corner, with the visible red circle inside it
 * (centered via flex). This gives mobile users a finger-sized tap target
 * (32 CSS px) while keeping the visual chrome small (20 CSS px).
 *
 * `touch-action: none` ensures touch events don't trigger native scroll/zoom
 * on phones — the tap reaches our pointer handler instead.
 *
 * Has an explicit z-index so it renders ABOVE the NE resize handle (which
 * sits 15 px further outside the note thanks to RESIZE_GRID_OFFSET; the
 * handle's hit area is also enlarged, so they overlap visually unless the
 * delete button is on top).
 */
const DeleteButton: React.FC<Props> = ({ onClick }) => {
  const offset = -DELETE_BUTTON_HIT_SIZE / 2;
  return (
    <button
      type="button"
      data-archon-note-delete
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick(e);
      }}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: offset,
        right: offset,
        width: DELETE_BUTTON_HIT_SIZE,
        height: DELETE_BUTTON_HIT_SIZE,
        background: 'transparent',
        border: 'none',
        padding: 0,
        margin: 0,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
        touchAction: 'none',
        zIndex: Z_DELETE_BUTTON,
      }}
      aria-label="Delete note"
    >
      <span
        aria-hidden
        style={{
          width: DELETE_BUTTON_VISIBLE_SIZE,
          height: DELETE_BUTTON_VISIBLE_SIZE,
          borderRadius: '50%',
          background: '#ef4444',
          color: '#ffffff',
          border: '2px solid #ffffff',
          boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <X size={12} strokeWidth={3} />
      </span>
    </button>
  );
};

export default DeleteButton;
