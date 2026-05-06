# archon-note — Host Contract

> Read this file before touching `client/src/plugins/types.ts`, `api.ts`, `CanvasOverlayPluginHost.tsx`, `PluginHost.tsx`, or anything else archon-note depends on.

## Required host capabilities

archon-note is a `displayMode: 'canvas-overlay'` plugin. The host MUST provide:

### 1. Plugin lifecycle for `'canvas-overlay'`

- `ArchonPlugin.displayMode` accepts `'canvas-overlay'` (in addition to `'modal'` and `'floating'`).
- `ArchonPlugin.mountOverlay(container, api)` — called once by `CanvasOverlayPluginHost` immediately after registration. The plugin renders into `container`. Container is a DOM `<div>` layered above the canvas at `z-[400]`, full inset, `pointer-events: none` (children opt in).
- `ArchonPlugin.unmountOverlay()` — called when the plugin is unregistered. Plugin tears down its React root.
- `ArchonPlugin.onIconClick(api)` — called by `PluginHost` when the user clicks the plugin icon (left palette flyout, view-mode drawer, plugins section). `PluginHost` immediately calls `onClose()` so the slot resets without opening any modal.

### 2. Required `ArchonPluginAPI` methods

| Method | Used by archon-note for |
|--------|-------------------------|
| `getProjectState()` | (unused — kept for forward compatibility) |
| `showNotification(msg, type)` | View-mode warning when icon clicked |
| `getPluginData()` | Read current notes on every render |
| `applyPluginDataDelta(delta, label)` | Persist all mutations (undo-able) |
| `getViewport()` | World ⇄ screen projection; viewport-center for new note |
| `subscribeToViewport(cb)` | Re-render on pan / zoom / canvas resize |
| `subscribeToProjectChanges(cb)` | Re-render on undo/redo and external mutations |
| `getIsViewMode()` | Disable mutations and pointer events when true |
| `subscribeToViewMode(cb)` | React to view-mode toggle |
| `getIsDrawingMode()` | Dim overlay + disable interaction when true |
| `subscribeToDrawingMode(cb)` | React to drawing-mode toggle |

archon-note **does NOT** use `applyMcpOperations`, `exportLayerAsPNG`, `exportScenarioAsVideo`, `exportSystemContainerDiagram`, `checkVoicingAvailable`, `getWindowHeaderContainer`, `setWindowMinimized`. They are floating-window or modal concerns.

### 3. Persistence

`installedPlugins[pluginId].pluginData` MUST round-trip through:

- `localStorage` save/load (debounced via `store.subscribe` in `client/src/store/index.ts`).
- JSON file import/export (via `useProjectIO.ts`).
- Google Drive save/load (uses the same `{ project }` envelope).
- `migrateProject.ts` — must initialise empty `installedPlugins = {}` for legacy files (already done).

### 4. Undo / redo

- `applyPluginDataDelta` reducer in `projectSlice.ts` accepts `{ pluginId, delta: { set?, remove? } }` and merges into `installedPlugins[id].pluginData`.
- `applyHistoryDelta` reducer in `projectSlice.ts` accepts `delta.installedPlugins[id].pluginData` (either as `{ set?, remove? }` patch, `null` to clear, or whole-object replacement).
- `HistoryActionType` union includes `'PLUGIN_DATA_UPDATE'`.
- The host bridge in `CanvasOverlayPluginHost.tsx` builds the undo delta automatically (`buildUndoDelta(before, delta)` in that file).

## What archon-note expects in return

When archon-note calls `api.applyPluginDataDelta({ set: { notes: {…}, noteOrder: […] } }, label)`:

1. Within the same tick: `installedPlugins['archon-note'].pluginData.notes` and `.noteOrder` are replaced with the patched values.
2. Within the same tick: a `'PLUGIN_DATA_UPDATE'` history command is pushed onto the global undo stack.
3. Within the same tick: `subscribeToProjectChanges` callbacks fire (because `state.project` reference changed).
4. Eventually (debounced): persistence layer writes to `localStorage` / Drive.

`applyPluginDataDelta` MUST be synchronous — `notesStore.ts` callers expect the patch to be visible to the next `getPluginData()` call in the same handler.

## Failure modes

- **Old host without `applyPluginDataDelta` on the bridge**: `createPluginAPI` falls back to a whole-data `setPluginData` call. Mutations succeed but are NOT undo-able. (Fallback is in `client/src/plugins/api.ts`.)
- **Old host without `mountOverlay`**: archon-note never mounts. The plugin becomes a no-op. There is no graceful fallback to a modal — `displayMode: 'canvas-overlay'` is intentional.
- **Old host without `getViewport`**: `readViewport` (in `store/viewport.ts`) returns an identity viewport sized to `window.innerWidth/Height`. Notes will show but coordinates won't track the canvas — better to fix the host than to ship without `getViewport`.
- **Old host without `subscribeToProjectChanges`**: archon-note renders once per mount and never updates. Don't ship without this.

## What the host owns vs what archon-note owns

| Concern | Owner |
|---------|-------|
| Plugin script loading | host (loader.ts) |
| Plugin registration | host (registry.ts) |
| Overlay container DOM (`<div data-plugin-overlay>`) | host (CanvasOverlayPluginHost.tsx) |
| Plugin icon UI in palettes / drawers | host |
| `onIconClick` dispatch from icon press | host (PluginHost.tsx) |
| Note DOM, drag, resize, edit, color picker, font toggle, fitText | archon-note |
| Note shape, validation, default values | archon-note (`types.ts`, `notesStore.ts`, `colors.ts`, `constants.ts`) |
| Persistence wire format | host's `pluginData` slot — archon-note picks the inner shape |
| Undo command type | host (`'PLUGIN_DATA_UPDATE'`) — archon-note opts in by using `applyPluginDataDelta` |
