import React from 'react';
import ReactDOM from 'react-dom/client';
import { ArchonPlugin, ArchonPluginAPI, ArchonNote } from './types';
import NotesOverlay from './components/NotesOverlay';
import { generateId } from './utils/id';
import { createNote } from './store/notesStore';
import { readViewport, viewportCenterWorld } from './store/viewport';
import { DEFAULT_FONT_FAMILY, DEFAULT_NOTE_SIZE } from './constants';
import { DEFAULT_NOTE_COLOR } from './colors';
import './fonts.css';

declare global {
  interface Window {
    __archon_register_plugin: (plugin: ArchonPlugin) => void;
  }
  // injected by vite.config.ts
  const __PLUGIN_VERSION__: string;
}

let root: ReactDOM.Root | null = null;

const plugin: ArchonPlugin = {
  id: 'archon-note',
  name: 'Archon Note',
  version: typeof __PLUGIN_VERSION__ !== 'undefined' ? __PLUGIN_VERSION__ : '0.1.0',
  icon: 'StickyNote',
  displayMode: 'canvas-overlay',

  activate(_api: ArchonPluginAPI) {
    // No-op. The real lifecycle for canvas-overlay plugins is mountOverlay.
  },

  // Required by the host's ArchonPlugin contract for back-compat with plugins
  // that may be opened in a host window. archon-note never is — onIconClick is
  // dispatched instead — but we expose a defensive empty render here.
  render(_api: ArchonPluginAPI, _container: HTMLElement) {
    // intentionally empty
  },

  mountOverlay(container: HTMLElement, api: ArchonPluginAPI) {
    if (root) root.unmount();
    root = ReactDOM.createRoot(container);
    root.render(
      <React.StrictMode>
        <NotesOverlay api={api} />
      </React.StrictMode>,
    );
  },

  unmountOverlay() {
    if (root) {
      root.unmount();
      root = null;
    }
  },

  onIconClick(api: ArchonPluginAPI) {
    if (api.getIsViewMode?.()) {
      api.showNotification('Notes are read-only in view mode', 'warning');
      return;
    }
    const vp = readViewport(api);
    const center = viewportCenterWorld(vp);
    const note: ArchonNote = {
      id: generateId(),
      position: {
        x: center.x - DEFAULT_NOTE_SIZE.width / 2,
        y: center.y - DEFAULT_NOTE_SIZE.height / 2,
      },
      size: { ...DEFAULT_NOTE_SIZE },
      text: '',
      bgColor: DEFAULT_NOTE_COLOR,
      fontFamily: DEFAULT_FONT_FAMILY,
    };
    createNote(api, note);
  },
};

window.__archon_register_plugin(plugin);
