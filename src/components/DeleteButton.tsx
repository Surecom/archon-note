import React from 'react';
import { X } from 'lucide-react';
import { Z_DELETE_BUTTON } from '../constants';

interface Props {
  onClick: (e: React.PointerEvent) => void;
}

/**
 * Red-circle X delete button anchored to the TOP-RIGHT corner of the note.
 * Positioned so its center sits exactly on the note's NE corner (`top: -10;
 * right: -10`) — half inside, half outside the note, mirroring the Miro
 * convention for sticky-note delete affordances.
 *
 * Has an explicit z-index so it renders ABOVE the NE resize handle (which
 * sits 10 px further outside the note thanks to RESIZE_GRID_OFFSET — they
 * overlap visually unless the delete button is on top).
 */
const DeleteButton: React.FC<Props> = ({ onClick }) => {
  return (
    <button
      type="button"
      data-archon-note-delete
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick(e);
      }}
      style={{
        position: 'absolute',
        top: -10,
        right: -10,
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: '#ef4444',
        color: '#ffffff',
        border: '2px solid #ffffff',
        boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        pointerEvents: 'auto',
        zIndex: Z_DELETE_BUTTON,
      }}
      aria-label="Delete note"
    >
      <X size={12} strokeWidth={3} />
    </button>
  );
};

export default DeleteButton;
