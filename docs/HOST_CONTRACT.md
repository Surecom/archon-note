# archon-note — Host Contract

> Read this file before changing anything in this plugin that depends on what the host provides — the lifecycle hooks, the plugin API surface, persistence semantics, or undo/redo.

## Required host capabilities

archon-note is a `displayMode: 'canvas-overlay'` plugin. The host MUST provide:

### 1. Plugin lifecycle for `'canvas-overlay'`

- `ArchonPlugin.displayMode` accepts `'canvas-overlay'` (in addition to `'modal'` and `'floating'`).
- `ArchonPlugin.mountOverlay(container, api)` — called once by the host immediately after registration. The plugin renders into `container`. The container is a DOM `<div>` layered above the canvas, full inset, `pointer-events: none` (children opt in).
- `ArchonPlugin.unmountOverlay()` — called when the plugin is unregistered. The plugin tears down its React root.
- `ArchonPlugin.onIconClick(api)` — called by the host when the user clicks the plugin icon (anywhere the host surfaces it). The host immediately closes whatever icon-click slot it had so no modal opens.
- `ArchonPlugin.beforeUninstall(api)` ⭐ — called by the host immediately before uninstalling the plugin. Returns either:
  - a `PluginUninstallConfirmation` describing what data will be lost (host shows a `ConfirmModal` and only proceeds on user confirm), or
  - `null` / `undefined` for silent uninstall (legacy behaviour).
  May be sync or async; the host awaits the promise/value before deciding what to show. archon-note implements this to enumerate notes per integration layer (see `src/index.tsx`).

### 2. Required `ArchonPluginAPI` methods

| Method | Used by archon-note for |
|--------|-------------------------|
| `getProjectState()` | (unused — kept for forward compatibility) |
| `showNotification(msg, type)` | View-mode warning when icon clicked |
| `getPluginData()` | Read current notes on every render |
| `applyPluginDataDelta(delta, label)` | Persist all mutations (undo-able) |
| `getViewport()` | World ⇄ screen projection; viewport-center for new note; rAF fallback |
| `subscribeToViewport(cb)` | (unused — see `subscribeToViewportFrame` below) |
| `subscribeToProjectChanges(cb)` | Re-render on undo/redo and external mutations |
| `getIsViewMode()` | Disable mutations and pointer events when true |
| `subscribeToViewMode(cb)` | React to view-mode toggle |
| `getIsDrawingMode()` | Dim overlay + disable interaction when true |
| `subscribeToDrawingMode(cb)` | React to drawing-mode toggle |
| `subscribeToViewportFrame(cb)` ⭐ | Per-frame viewport tick — drives the per-Note DOM-mutation pass for zero-lag camera follow + drag/resize transient state. Falls back to a per-Note `requestAnimationFrame` loop on older hosts. |
| `attachCanvasWheelForwarding(el)` ⭐ | Wheel re-dispatch onto the host canvas so panning continues over notes / styling button / styling popup. Falls back to a plugin-local helper on older hosts. |
| `getCanvasElement()` ⭐ | Used inside the wheel-forwarding fallback when the host predates `attachCanvasWheelForwarding` but already exposes `getCanvasElement`. |
| `getSelectedLayerId()` ⭐⭐ | Read the currently active integration-layer id. archon-note tags new notes with this id at creation time so they only appear on the layer they were drawn on. Falls back to `'default-layer'` when the host predates this method. |
| `subscribeToSelectedLayer(cb)` ⭐⭐ | Fire when the user picks a different integration layer. archon-note re-filters its visible-note set on each callback. No fallback — older hosts simply never trigger the callback, in which case all notes share the default layer. |

⭐ = canvas-overlay helper API. Plugins built against it must keep a fallback for older hosts (archon-note does — see `attachWheelForwarding(api, el)` and the `if (api.subscribeToViewportFrame) … else { requestAnimationFrame loop }` branch in `src/components/Note.tsx`).
⭐⭐ = layer-aware plugin API (host >= 2026-05-08). Required for layer scoping but optional in the type signature for backward compat.

### 2a. Uninstall confirmation contract

The `beforeUninstall(api)` hook returns one of:

```ts
interface PluginUninstallConfirmation {
  title?: string;            // defaults to `Remove {plugin name}?` (host wording)
  message: string;           // main body — plain text
  items?: Array<{ label: string; detail?: string }>;  // bulleted "what will be lost"
  confirmLabel?: string;     // defaults to 'Remove' (host wording)
  cancelLabel?: string;      // defaults to 'Cancel'
}
```

> **Note on user-facing wording.** The TYPE name keeps `Uninstall` (developer-facing API contract surface, used across plugins). The host's USER-FACING fallback labels were intentionally chosen as `Remove` / `Keep in project` to make the action feel like removing-from-project rather than deleting-from-system. archon-note overrides these with the same wording family ("Remove ArchON Note?", "Remove and delete notes", "Keep in project") in its `beforeUninstall` return value.

The host renders these into its `ConfirmModal` (`type: 'danger'`). Items appear as a bulleted list between message and buttons. archon-note returns one item per integration layer that has notes (`{ label: 'Auth Flow', detail: '5 notes' }`). Returning `null` from the hook (or omitting it entirely) means no confirmation — uninstall proceeds silently. Throwing inside the hook is logged and treated as `null` — the host refuses to trap the user behind a buggy plugin.

archon-note **does NOT** use `applyMcpOperations`, `exportLayerAsPNG`, `exportScenarioAsVideo`, `exportSystemContainerDiagram`, `checkVoicingAvailable`, `getWindowHeaderContainer`, `setWindowMinimized`. Those are floating-window or modal concerns.

### 3. Persistence

`installedPlugins[pluginId].pluginData` MUST round-trip through whatever persistence pipeline the host uses (typically: in-browser localStorage save/load, JSON file import/export, and any cloud sync flow). The host MUST also initialise an empty `installedPlugins` map for legacy projects that pre-date plugin support.

### 4. Undo / redo

- The host's `applyPluginDataDelta(pluginId, delta, label)` action accepts `{ set?, remove? }` and merges into `installedPlugins[id].pluginData`.
- The host's history-replay action accepts `delta.installedPlugins[id].pluginData` (either as a `{ set?, remove? }` patch, `null` to clear, or a whole-object replacement).
- The host's `HistoryActionType` union includes `'PLUGIN_DATA_UPDATE'`.
- The host's plugin bridge builds the undo delta automatically.

## What archon-note expects in return

When archon-note calls `api.applyPluginDataDelta({ set: { notes: {…}, noteOrder: […] } }, label)`:

1. Within the same tick: `installedPlugins['archon-note'].pluginData.notes` and `.noteOrder` are replaced with the patched values.
2. Within the same tick: a `'PLUGIN_DATA_UPDATE'` history command is pushed onto the global undo stack.
3. Within the same tick: `subscribeToProjectChanges` callbacks fire (because `state.project` reference changed).
4. Eventually (debounced): the persistence layer writes to durable storage.

`applyPluginDataDelta` MUST be synchronous — `src/store/notesStore.ts` callers expect the patch to be visible to the next `getPluginData()` call in the same handler.

## Failure modes

- **Old host without `applyPluginDataDelta` on the bridge**: the plugin's API wrapper (mirror of the host bridge) falls back to a whole-data `setPluginData` call. Mutations succeed but are NOT undo-able.
- **Old host without `mountOverlay`**: archon-note never mounts. The plugin becomes a no-op. There is no graceful fallback to a modal — `displayMode: 'canvas-overlay'` is intentional.
- **Old host without `getViewport`**: `readViewport` (in `src/store/viewport.ts`) returns an identity viewport sized to `window.innerWidth/Height`. Notes will show but coordinates won't track the canvas — better to fix the host than to ship without `getViewport`.
- **Old host without `subscribeToProjectChanges`**: archon-note renders once per mount and never updates. Don't ship without this.

## What the host owns vs what archon-note owns

| Concern | Owner |
|---------|-------|
| Plugin script loading | host |
| Plugin registration | host |
| Overlay container DOM (`<div data-plugin-overlay>`) | host |
| Plugin icon UI surfaces (palettes, drawers, etc.) | host |
| `onIconClick` dispatch from icon press | host |
| Note DOM, drag, resize, edit, color picker, font toggle, fitText | archon-note |
| Note shape, validation, default values | archon-note (`src/types.ts`, `src/store/notesStore.ts`, `src/colors.ts`, `src/constants.ts`) |
| Persistence wire format | host's `pluginData` slot — archon-note picks the inner shape |
| Undo command type | host (`'PLUGIN_DATA_UPDATE'`) — archon-note opts in by using `applyPluginDataDelta` |
