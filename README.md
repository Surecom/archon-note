# archon-note

Sticky-note overlay for the [ArchON](https://archon.su) canvas. Public plugin. Authored from scratch.

> **Token-efficiency tip for AI agents:** before editing the plugin or its host integration, read **ALL** of `docs/` in this folder. Together they cover everything the host exposes, what the plugin owns, and the invariants you must not break — saves you from reading 10+ source files every time.

## What it does

- Click the plugin icon → a sticky note drops in the center of the viewport.
- Click a note → it's selected (resize handles + delete button + styling popup).
- Double-click a note → it goes into edit mode (textarea focused, dynamic font sizing).
- Click outside → deselect / commit text.
- 16-color palette + serif/sans font toggle in the styling popup.
- Drag to move, drag corners/edges to resize.
- Red-circle X button (top-right) deletes.
- All actions are undo-able with global Cmd+Z.
- Notes persist with the project (localStorage, JSON export, Google Drive).

## How to install (development)

Build inside the plugin folder; deploy from the repo root via the centralised script in `_plugin-deploy/` (see [`../_plugin-deploy/README.md`](../_plugin-deploy/README.md)).

```bash
# 1. build the plugin
cd archon-note
npm install
npm run build           # → build/index.js + build/style.css
npm run package         # → build/archon-note.zip + bumps version
```

`deploy` and `deploy:dev` are intentionally **not** in this plugin's `package.json` — the deploy recipe is centralised in `_plugin-deploy/` so consumers reading the plugin source don't see how it gets to the marketplace.

## How it integrates with the host

`displayMode: 'canvas-overlay'`. The host's `CanvasOverlayPluginHost` (in `client/src/components/`) auto-mounts the plugin into a dedicated `<div>` layered above the canvas (`z-[400]`) as soon as the script loads — no host modal/window. Clicks on the plugin icon (left-palette flyout, view-mode drawer, etc.) dispatch `onIconClick(api)` instead of opening any host UI.

## Documentation map

| File | Read when… |
|------|-----------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | You're changing the state machine (idle/selected/editing), drag/resize logic, viewport math, fitText, undo strategy, or drawing/view-mode behavior. |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | You're changing the `ArchonNote` shape, the `pluginData` slot layout, or anything that touches save/load. |
| [docs/HOST_CONTRACT.md](docs/HOST_CONTRACT.md) | You're touching `client/src/plugins/types.ts`, `api.ts`, `CanvasOverlayPluginHost.tsx`, or any host code archon-note depends on. |
| [docs/UI_SPEC.md](docs/UI_SPEC.md) | You're tweaking colors, fonts, sizes, padding, popup positioning, or any visual concern. |

## Critical invariants (do not break)

1. Notes live in `installedPlugins['archon-note'].pluginData`, **never** in top-level `ProjectState`.
2. Mutations always go through `api.applyPluginDataDelta(...)` so they participate in global Cmd+Z.
3. Plugin auto-mounts via `mountOverlay`; clicking the icon triggers `onIconClick` (no host modal).
4. View mode → no mutations of any kind. Drawing mode → opacity 0.55 + pointer-events disabled on overlay root.
5. Single click = select; double-click = edit; pointer-move > 5 px = drag (Miro-like dispatch).

## License

MIT (or whatever the surrounding monorepo uses) — code in this folder is original.
