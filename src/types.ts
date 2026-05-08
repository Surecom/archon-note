/**
 * Local mirror of the host's plugin API surface used by archon-note.
 * Keeping the types here (rather than importing from the host) means the
 * plugin builds in isolation and ships as a self-contained IIFE.
 */

/**
 * Font family for note text.
 *  - `'sans'`   → system Sans Serif (fast, locally available, neutral).
 *  - `'marker'` → "Permanent Marker" (Google Font, hand-written felt-tip look).
 *
 * Legacy projects may carry `fontFamily: 'serif'` from older builds; the
 * normalization in `store/notesStore.ts` maps that to `'marker'` on read.
 */
export type NoteFontFamily = 'sans' | 'marker';

/**
 * A sticky note. Lives entirely in `installedPlugins['archon-note'].pluginData.notes[id]`.
 * `position` and `size` are world coordinates (the same coordinate system the
 * canvas uses for systems / containers). Font size is NOT stored — it is
 * recomputed every render via `utils/fitText.ts`.
 *
 * `layerId` ties the note to a specific integration layer of the host project
 * — the note is only visible on that layer (mirrors how the host's own
 * elements are scoped to layers). Set at creation time from the active
 * `selectedLayerId`. Legacy notes without `layerId` (predating this field)
 * are migrated to `'default-layer'` by `notesStore.normalizeNote`.
 */
export interface ArchonNote {
  id: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  text: string;
  bgColor: string;
  fontFamily: NoteFontFamily;
  layerId: string;
}

export interface ArchonNotePluginData {
  notes: Record<string, ArchonNote>;
  /**
   * Stable z-order: indexes earlier in the array render below indexes later.
   * Adding a new note pushes its id to the end. Selecting a note moves it to
   * the end so the user always interacts with the topmost copy.
   */
  noteOrder: string[];
}

// ---------- Host API mirror ----------

export interface ViewportSnapshot {
  zoom: number;
  offset: { x: number; y: number };
  canvasSize: { width: number; height: number };
}

export interface PluginDataDelta {
  set?: Record<string, unknown>;
  remove?: string[];
}

export interface ArchonPluginAPI {
  showNotification(message: string, type: 'info' | 'warning' | 'error' | 'success'): void;
  getPluginData(): Record<string, unknown>;
  setPluginData(data: Record<string, unknown>): void;
  applyPluginDataDelta(delta: PluginDataDelta, label: string): void;
  getViewport?(): ViewportSnapshot;
  subscribeToViewport?(cb: () => void): () => void;
  subscribeToProjectChanges?(cb: () => void): () => void;
  getIsViewMode?(): boolean;
  subscribeToViewMode?(cb: () => void): () => void;
  getIsDrawingMode?(): boolean;
  subscribeToDrawingMode?(cb: () => void): () => void;
  // Canvas-overlay helper API (host >= 2026-05-06). Plugins must keep a
  // fallback for older hosts.
  getCanvasElement?(): HTMLCanvasElement | null;
  attachCanvasWheelForwarding?(element: HTMLElement): () => void;
  subscribeToViewportFrame?(cb: (vp: ViewportSnapshot) => void): () => void;
  // Selected-layer access (host >= 2026-05-08). Used to scope notes to the
  // user's currently active integration layer.
  getSelectedLayerId?(): string | null;
  subscribeToSelectedLayer?(cb: () => void): () => void;
}

/**
 * Optional payload `beforeUninstall(api)` can return to make the host show a
 * confirmation modal before uninstalling. Mirrors the host's contract.
 */
export interface PluginUninstallConfirmation {
  title?: string;
  message: string;
  items?: Array<{ label: string; detail?: string }>;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface ArchonPlugin {
  id: string;
  name: string;
  version: string;
  icon: string;
  displayMode: 'modal' | 'floating' | 'canvas-overlay';
  activate(api: ArchonPluginAPI): void;
  deactivate?(): void;
  render(api: ArchonPluginAPI, container: HTMLElement): void;
  mountOverlay?(container: HTMLElement, api: ArchonPluginAPI): void;
  unmountOverlay?(): void;
  onIconClick?(api: ArchonPluginAPI): void;
  /**
   * Called by the host immediately before uninstalling. Return a
   * confirmation payload to make the host show a `ConfirmModal` and only
   * proceed on user confirm; return `null` for silent uninstall.
   */
  beforeUninstall?(api: ArchonPluginAPI):
    | Promise<PluginUninstallConfirmation | null>
    | PluginUninstallConfirmation
    | null;
}
