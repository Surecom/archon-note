import React from 'react';
import { Palette } from 'lucide-react';
import { STYLING_BUTTON_SIZE } from '../constants';

interface Props {
  onClick: () => void;
}

/**
 * Small "open styling" button. Pure visual component — its position is set
 * by the parent container in Note.tsx (which is transformed via rAF, in sync
 * with the canvas viewport).
 */
const StylingButton: React.FC<Props> = ({ onClick }) => {
  return (
    <button
      type="button"
      data-archon-note-styling-btn
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        width: STYLING_BUTTON_SIZE,
        height: STYLING_BUTTON_SIZE,
        borderRadius: STYLING_BUTTON_SIZE / 2,
        background: '#ffffff',
        border: '1px solid rgba(15, 23, 42, 0.12)',
        boxShadow: '0 2px 6px rgba(15, 23, 42, 0.16), 0 1px 2px rgba(15, 23, 42, 0.10)',
        color: '#1f2937',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
        pointerEvents: 'auto',
      }}
      aria-label="Open note styling"
      title="Styling"
    >
      <Palette size={14} strokeWidth={2.2} />
    </button>
  );
};

export default StylingButton;
