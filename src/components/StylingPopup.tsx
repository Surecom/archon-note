import React from 'react';
import { Check } from 'lucide-react';
import { NOTE_PALETTE } from '../colors';
import { FONT_STACKS, FONT_STYLE } from '../constants';
import { NoteFontFamily } from '../types';

interface Props {
  /** Screen-pixel position to anchor the popup to (top-left corner). */
  position: { x: number; y: number };
  bgColor: string;
  fontFamily: NoteFontFamily;
  onPickColor: (hex: string) => void;
  onPickFont: (family: NoteFontFamily) => void;
}

const StylingPopup: React.FC<Props> = ({ position, bgColor, fontFamily, onPickColor, onPickFont }) => {
  return (
    <div
      data-archon-note-popup
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        background: '#ffffff',
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.12)',
        padding: 10,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* 4x4 color grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 28px)',
          gridTemplateRows: 'repeat(4, 28px)',
          gap: 6,
        }}
      >
        {NOTE_PALETTE.map((swatch) => {
          const active = swatch.hex.toLowerCase() === bgColor.toLowerCase();
          return (
            <button
              key={swatch.hex}
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onPickColor(swatch.hex);
              }}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: swatch.hex,
                border: active ? `2px solid #1f2937` : `1px solid rgba(0,0,0,0.08)`,
                boxShadow: '0 1px 2px rgba(0,0,0,0.10)',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: swatch.textColor,
              }}
              aria-label={`Background color ${swatch.hex}`}
            >
              {active && <Check size={14} strokeWidth={3} />}
            </button>
          );
        })}
      </div>

      {/* divider */}
      <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(0,0,0,0.08)' }} />

      {/* Font toggle */}
      <div style={{ display: 'flex', gap: 4 }}>
        {(['sans', 'serif'] as NoteFontFamily[]).map((family) => {
          const active = family === fontFamily;
          return (
            <button
              key={family}
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onPickFont(family);
              }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: active ? '#1f2937' : '#f3f4f6',
                color: active ? '#ffffff' : '#1f2937',
                border: '1px solid rgba(0,0,0,0.08)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: FONT_STACKS[family],
                fontStyle: FONT_STYLE[family],
                fontWeight: 600,
                fontSize: 18,
                lineHeight: 1,
                padding: 0,
              }}
              aria-label={`Font ${family}`}
            >
              Aa
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default StylingPopup;
