import React, { useCallback, useEffect, useState } from 'react';
import { ArchonPluginAPI, ViewportSnapshot } from '../types';
import { readViewport } from '../store/viewport';
import { readNotesData } from '../store/notesStore';
import Note from './Note';

interface Props {
  api: ArchonPluginAPI;
}

type SelectionState = { id: string; mode: 'selected' | 'editing' } | null;

const NotesOverlay: React.FC<Props> = ({ api }) => {
  // ---------- subscriptions ----------

  // viewport
  const [viewport, setViewport] = useState<ViewportSnapshot>(() => readViewport(api));
  useEffect(() => {
    const refresh = () => setViewport(readViewport(api));
    refresh();
    if (!api.subscribeToViewport) return;
    return api.subscribeToViewport(refresh);
  }, [api]);

  // notes (re-read on any project change — that covers undo/redo, project load,
  // and external mutations).
  const [data, setData] = useState(() => readNotesData(api));
  useEffect(() => {
    const refresh = () => setData(readNotesData(api));
    refresh();
    if (!api.subscribeToProjectChanges) return;
    return api.subscribeToProjectChanges(refresh);
  }, [api]);

  // view-mode
  const [isViewMode, setIsViewMode] = useState<boolean>(() => !!api.getIsViewMode?.());
  useEffect(() => {
    const refresh = () => setIsViewMode(!!api.getIsViewMode?.());
    refresh();
    if (!api.subscribeToViewMode) return;
    return api.subscribeToViewMode(refresh);
  }, [api]);

  // drawing-mode
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

  const handleSelect = useCallback((id: string) => setSelection({ id, mode: 'selected' }), []);
  const handleEdit = useCallback((id: string) => setSelection({ id, mode: 'editing' }), []);
  const handleDeselect = useCallback(() => setSelection(null), []);

  return (
    <>
      {data.noteOrder.map((id) => {
        const note = data.notes[id];
        if (!note) return null;
        const noteState =
          selection?.id === id
            ? selection.mode
            : 'idle';
        return (
          <Note
            key={id}
            note={note}
            viewport={viewport}
            isViewMode={isViewMode}
            isDrawingMode={isDrawingMode}
            state={noteState}
            api={api}
            onRequestSelect={() => handleSelect(id)}
            onRequestEdit={() => handleEdit(id)}
            onRequestDeselect={handleDeselect}
          />
        );
      })}
    </>
  );
};

export default NotesOverlay;
