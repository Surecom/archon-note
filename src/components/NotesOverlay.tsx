import React, { useCallback, useEffect, useState } from 'react';
import { ArchonPluginAPI } from '../types';
import { readNotesData } from '../store/notesStore';
import Note from './Note';

interface Props {
  api: ArchonPluginAPI;
}

type SelectionState = {
  id: string;
  mode: 'selected' | 'editing';
  /** True when the styling popup is open for this note. Reset when selection changes. */
  popupOpen: boolean;
} | null;

const NotesOverlay: React.FC<Props> = ({ api }) => {
  // Notes / view-mode / drawing-mode are subscribed via React state — they
  // change rarely and need to trigger re-render (chrome visibility, mounting
  // of new note components, etc.).
  //
  // Viewport is NOT in React state. Each Note reads it via api.getViewport()
  // inside its own rAF loop and applies viewport-driven DOM mutations directly
  // (transform / size / font / etc.). This keeps notes in lock-step with the
  // canvas's ref-based render loop — same frame, zero lag.

  const [data, setData] = useState(() => readNotesData(api));
  useEffect(() => {
    const refresh = () => setData(readNotesData(api));
    refresh();
    if (!api.subscribeToProjectChanges) return;
    return api.subscribeToProjectChanges(refresh);
  }, [api]);

  const [isViewMode, setIsViewMode] = useState<boolean>(() => !!api.getIsViewMode?.());
  useEffect(() => {
    const refresh = () => setIsViewMode(!!api.getIsViewMode?.());
    refresh();
    if (!api.subscribeToViewMode) return;
    return api.subscribeToViewMode(refresh);
  }, [api]);

  const [isDrawingMode, setIsDrawingMode] = useState<boolean>(() => !!api.getIsDrawingMode?.());
  useEffect(() => {
    const refresh = () => setIsDrawingMode(!!api.getIsDrawingMode?.());
    refresh();
    if (!api.subscribeToDrawingMode) return;
    return api.subscribeToDrawingMode(refresh);
  }, [api]);

  // ---------- selection ----------

  const [selection, setSelection] = useState<SelectionState>(null);

  // Drop selection if its note disappears (deleted, undone, project loaded).
  useEffect(() => {
    if (selection && !data.notes[selection.id]) setSelection(null);
  }, [data, selection]);

  // Drop selection when entering view mode or drawing mode.
  useEffect(() => {
    if (isViewMode || isDrawingMode) setSelection(null);
  }, [isViewMode, isDrawingMode]);

  const handleSelect = useCallback((id: string) => {
    setSelection(s => s && s.id === id ? { ...s, mode: 'selected' } : { id, mode: 'selected', popupOpen: false });
  }, []);
  const handleEdit = useCallback((id: string) => {
    setSelection(s => s && s.id === id ? { ...s, mode: 'editing' } : { id, mode: 'editing', popupOpen: false });
  }, []);
  const handleDeselect = useCallback(() => setSelection(null), []);
  const handleTogglePopup = useCallback((id: string) => {
    setSelection(s => (s && s.id === id) ? { ...s, popupOpen: !s.popupOpen } : s);
  }, []);
  const handleClosePopup = useCallback((id: string) => {
    setSelection(s => (s && s.id === id && s.popupOpen) ? { ...s, popupOpen: false } : s);
  }, []);

  return (
    <>
      {data.noteOrder.map((id) => {
        const note = data.notes[id];
        if (!note) return null;
        const isThis = selection?.id === id;
        const noteState = isThis ? selection!.mode : 'idle';
        const popupOpen = isThis ? selection!.popupOpen : false;
        return (
          <Note
            key={id}
            note={note}
            isViewMode={isViewMode}
            isDrawingMode={isDrawingMode}
            state={noteState}
            popupOpen={popupOpen}
            api={api}
            onRequestSelect={() => handleSelect(id)}
            onRequestEdit={() => handleEdit(id)}
            onRequestDeselect={handleDeselect}
            onTogglePopup={() => handleTogglePopup(id)}
            onClosePopup={() => handleClosePopup(id)}
          />
        );
      })}
    </>
  );
};

export default NotesOverlay;
