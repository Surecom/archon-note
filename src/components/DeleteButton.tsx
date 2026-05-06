import React from 'react';
import { X } from 'lucide-react';

interface Props {
  onClick: (e: React.PointerEvent) => void;
}

const DeleteButton: React.FC<Props> = ({ onClick }) => {
  return (
    <button
      type="button"
      data-archon-note-delete
      onPointerDown={(e) => {
        // Stop the parent note's pointerdown handler from initiating drag.
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
      }}
      aria-label="Delete note"
    >
      <X size={12} strokeWidth={3} />
    </button>
  );
};

export default DeleteButton;
