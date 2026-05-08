import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

const FALLBACK_LAYER_ID = 'default-layer';

const NotesOverlay: React.FC<Props> = ({ api }) => {
  // Notes / view-mode / drawing-mode / selected-layer are subscribed via
  // React state — they change rarely and need to trigger re-render
  // (chrome visibility, mounting of new note components, switching the
  // visible-note set when the user picks a different integration layer, etc.).
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

  // ---------- Selected integration layer ----------
  // Notes are scoped to the layer they were created on (`note.layerId`).
  // Only notes matching the currently selected layer are rendered. When the
  // user switches layers, the visible-note set instantly swaps without any
  // mutation to pluginData.
  const [selectedLayerId, setSelectedLayerId] = useState<string>(
    () => api.getSelectedLayerId?.() || FALLBACK_LAYER_ID,
  );
  useEffect(() => {
    const refresh = () => setSelectedLayerId(api.getSelectedLayerId?.() || FALLBACK_LAYER_ID);
    refresh();
    if (!api.subscribeToSelectedLayer) return;
    return api.subscribeToSelectedLayer(refresh);
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

  // Drop selection when the selected note belongs to a layer that's no
  // longer visible (user switched away from the note's home layer).
  useEffect(() => {
    if (!selection) return;
    const note = data.notes[selection.id];
    if (note && note.layerId !== selectedLayerId) setSelection(null);
  }, [selectedLayerId, selection, data.notes]);

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

  // Filter the render list to notes belonging to the currently selected layer.
  // Preserves z-order from `data.noteOrder`.
  const visibleIds = useMemo(
    () => data.noteOrder.filter((id) => {
      const n = data.notes[id];
      return !!n && n.layerId === selectedLayerId;
    }),
    [data.noteOrder, data.notes, selectedLayerId],
  );

  return (
    <>
      {visibleIds.map((id) => {
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
