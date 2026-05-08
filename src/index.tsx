import React from 'react';
import ReactDOM from 'react-dom/client';
import { ArchonPlugin, ArchonPluginAPI, ArchonNote, PluginUninstallConfirmation } from './types';
import NotesOverlay from './components/NotesOverlay';
import { generateId } from './utils/id';
import { createNote, readNotesData } from './store/notesStore';
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

const FALLBACK_LAYER_ID = 'default-layer';

/**
 * Read the host's current selected integration layer. Falls back to
 * `'default-layer'` if the host doesn't expose `getSelectedLayerId` (older
 * builds) or if the host returns `null` (very rare — host always has a
 * default layer selected).
 */
function getActiveLayerId(api: ArchonPluginAPI): string {
  const id = api.getSelectedLayerId?.();
  return id || FALLBACK_LAYER_ID;
}

/**
 * Look up an integration layer's display name from the project state. Used
 * by `beforeUninstall` to show "5 notes on Auth Flow" instead of raw layer
 * ids in the confirmation modal.
 */
function getLayerName(api: ArchonPluginAPI, layerId: string): string {
  const project = (api as { getProjectState?: () => { integrationLayers?: Record<string, { name?: string }> } }).getProjectState?.();
  const layer = project?.integrationLayers?.[layerId];
  return layer?.name || layerId;
}

const plugin: ArchonPlugin = {
  id: 'archon-note',
  name: 'ArchON Note',
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
      layerId: getActiveLayerId(api),
    };
    createNote(api, note);
  },

  /**
   * Pre-uninstall confirmation. If the project has any notes, returns a
   * payload describing how many notes live on each integration layer so the
   * host can show them in a `ConfirmModal`. Returns `null` when there are no
   * notes (silent uninstall — nothing to lose).
   */
  beforeUninstall(api: ArchonPluginAPI): PluginUninstallConfirmation | null {
    const data = readNotesData(api);
    const ids = Object.keys(data.notes);
    if (ids.length === 0) return null;

    // Group notes by their layerId.
    const byLayer = new Map<string, number>();
    for (const id of ids) {
      const layerId = data.notes[id].layerId;
      byLayer.set(layerId, (byLayer.get(layerId) ?? 0) + 1);
    }

    // Build sorted list of {layerName, count} items.
    const items = Array.from(byLayer.entries())
      .map(([layerId, count]) => ({
        label: getLayerName(api, layerId),
        detail: `${count} ${count === 1 ? 'note' : 'notes'}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const total = ids.length;
    return {
      title: 'Remove ArchON Note?',
      message: `Removing the plugin will permanently delete ${total} ${total === 1 ? 'note' : 'notes'} from this project. This cannot be undone.`,
      items,
      confirmLabel: 'Remove and delete notes',
      cancelLabel: 'Keep in project',
    };
  },
};

window.__archon_register_plugin(plugin);
