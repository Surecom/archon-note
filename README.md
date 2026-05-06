# archon-note

Sticky-note overlay for the [ArchON](https://archon.su) canvas. Public plugin. Authored from scratch.

> **Token-efficiency tip for AI agents:** before editing the plugin or its host integration, read **ALL** of `docs/` in this folder. Together they cover everything the host exposes, what the plugin owns, and the invariants you must not break — saves you from reading 10+ source files every time.

## Screenshot

A selected note inside the ArchON canvas with the styling popup open — 16-color palette, `Sans Serif` / `Permanent Marker` font toggle, red-circle delete button on the top-right corner, blue resize handles 15 px outside the note edge:

![Selected archon-note with styling popup open](docs/screenshots/selected-note-styling-popup.jpg)

## What it does

- Click the plugin icon → a sticky note drops in the center of the viewport.
- Single-click a note → it's selected (resize grid extends 15 px past every edge, delete X at top-right, small Palette button above the resize grid).
- Click the Palette button → smart-positioned styling popup opens (16 colors + `Aa`/`Aa` font toggle). Stays inside the canvas viewport, prefers placements that don't cover the note text.
- Double-click a note → edit mode (textarea focused, dynamic font sizing, caret centered).
- Drag the note body to move; drag a resize handle to resize.
- Click outside → deselect / commit text. ESC also deselects.
- `Delete` / `Backspace` while selected → delete the note (skipped if focus is in any input).
- All actions are undo-able with global `Cmd+Z`.
- Notes persist with the project (localStorage, JSON export, Google Drive).

## Performance

- **Zero-lag camera follow.** Each note runs its own `requestAnimationFrame` loop that reads the current viewport synchronously and mutates DOM directly via refs (no React re-renders for camera changes). Notes update in the SAME frame as the canvas — no perceptible drag during pan / zoom.
- **GPU-accelerated movement** via `transform: translate3d(...)` + `willChange: 'transform'`.
- **Wheel forwarding.** A non-passive `wheel` listener on each note re-dispatches the event to the host `<canvas>` so panning continues smoothly when the cursor crosses a note.

## How to install (development)

Build inside the plugin folder; deploy from the repo root via the centralised script in `_plugin-deploy/` (see [`../_plugin-deploy/README.md`](../_plugin-deploy/README.md)).

```bash
# 1. build the plugin
cd archon-note
npm install
npm run build           # → build/index.js + build/style.css
npm run package         # → build/archon-note.zip + bumps version
```

## How it integrates with the host

`displayMode: 'canvas-overlay'`. The host's `CanvasOverlayPluginHost` (in `client/src/components/`) auto-mounts the plugin into a dedicated `<div>` layered above the canvas (`z-[400]`) as soon as the script loads — no host modal/window. Clicks on the plugin icon (left-palette flyout, view-mode drawer, etc.) dispatch `onIconClick(api)` instead of opening any host UI.

## Documentation map

| File | Read when… |
|------|-----------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | You're changing the state machine (idle/selected/editing), drag/resize logic, viewport math, fitText, undo strategy, drawing/view-mode behavior, the rAF loop, or wheel forwarding. |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | You're changing the `ArchonNote` shape, the `pluginData` slot layout, font-family enum, or anything that touches save/load. |
| [docs/HOST_CONTRACT.md](docs/HOST_CONTRACT.md) | You're touching `client/src/plugins/types.ts`, `api.ts`, `CanvasOverlayPluginHost.tsx`, or any host code archon-note depends on. |
| [docs/UI_SPEC.md](docs/UI_SPEC.md) | You're tweaking colors, fonts, sizes, padding, popup positioning, the styling button, or any visual concern. |

## Critical invariants (do not break)

1. Notes live in `installedPlugins['archon-note'].pluginData`, **never** in top-level `ProjectState`.
2. Mutations always go through `api.applyPluginDataDelta(...)` so they participate in global Cmd+Z. **Never** use `setPluginData` for partial updates — it replaces the whole slot and is NOT undo-able.
3. Plugin auto-mounts via `mountOverlay`; clicking the icon triggers `onIconClick` (no host modal).
4. View mode → no mutations of any kind. Drawing mode → opacity 0.55 + pointer-events disabled on overlay root.
5. Single click = select; double-click = edit; pointer-move > 5 px = drag (Miro-like dispatch).
6. Viewport-driven DOM mutations (`transform`, `width`, `height`, `padding`, `font-size`, textarea height, popup position) live in the per-note rAF loop. **No `viewport` React state** — that path produces a 1-frame lag behind the canvas.

## License

[MIT](LICENSE) © Surecom — code in this folder is original.
