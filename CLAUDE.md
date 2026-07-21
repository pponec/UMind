# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

`assignment.md` (written in Czech) is the authoritative spec: it pre-decides everything that would otherwise need a clarification round, so read it before starting work. The notes below summarize its binding decisions in English.

**Phase 0 (clickable prototype, no Java) is implemented** in the helper directory `prototype/` as three files — `index.html`, `app.js`, `style.css` — a working vanilla-JS outliner (all §4 keys, §5 edge cases, undo/redo, JSON export/import). It runs standalone via `file://`. When Phase 1 starts, these files move under `src/main/webapp/` so the servlets can serve them unchanged. Per-branch **collapse/expand toggles** (a Phase-2 item) are already built in: a ▸/▾ button in the left gutter flips `node.collapsed` and re-renders; collapse is treated as view state and is deliberately not pushed onto the undo stack. **Persistence** (Phase-0 stand-in for the server): **the file name is the unique project key** (`currentFileName`). `New` starts a fresh unnamed project; `Save As…` names it (the OS save dialog on Chromium, an in-app `<dialog>` name prompt elsewhere — `window.prompt`/`confirm` are avoided because they are blocked in the sandboxed published artifact) and that name becomes the key; `Save` writes back to it and falls through to Save As when unnamed; `Open…` switches to a file. When the File System Access API is available the real `.json` is written directly (and its handle reused); otherwise the project lives in `localStorage` under `umind:file:<name>` and Save As also downloads the file. Autosave (debounced 500 ms — the cadence Phase 1's server save reuses) writes to the active project's key (`umind:file:<name>`, or `umind:doc` for an unnamed scratch doc), and `umind:last` records which to restore on the next visit. The root node's text seeds the default file name (`slugify(root.text).json`). localStorage is unreliable under `file://` (opaque origin), so serve over http/localhost. Each document also carries a stable hidden `id` in its JSON (`ensureDocId`), unused in Phase 0 but ready to become `/api/map/{id}` in Phase 1. **Drag-and-drop** reordering/re-parenting (a Phase-2 item, explicitly out of the original MVP per §8) is implemented behind a `DND_ENABLED` flag in `app.js`: drag a node by its gutter grip and drop before/after another node at any level; dropping into the node's own subtree or as a sibling of the root is blocked. It is intentionally self-contained (flag + grip block in `buildNodeLi` + a "Drag and drop" JS section + `.drag-grip`/`.drop-*` CSS) so it can be disabled with one flag or removed cleanly. **The Maven build and the servlets do not exist yet** — Phase 1 and 2 are not started.

## What UMind is

A minimalist, self-hosted mind-mapping app. Core insight: the browser already provides tree (DOM), layout (CSS), and editing (`contenteditable`) — so **we write no rendering engine and no layout algorithm.** The app is an **outliner**: a nested list of editable nodes. Java does persistence only (accept JSON → store; load JSON → return); no map logic lives on the server.

## Locked decisions (do not re-litigate during build)

- **UI model:** outliner (nested `<ul>/<li>`), NOT free-positioned nodes on a canvas.
- **Node positioning:** computed by CSS/browser. No custom layout algorithm.
- **Text editing:** `contenteditable` per node; serialize to plain text.
- **Connector lines:** none in MVP — hierarchy is shown by CSS indentation + vertical guide lines. SVG connectors are phase 2.
- **Frontend:** vanilla JS, no framework, no build step. One `.html` + `.js` + `.css`.
- **Java:** Jakarta Servlet (`jakarta.servlet`), plain `HttpServlet`.
- **Persistence:** whole document at once, debounced (500 ms) POST to one endpoint. No diffs. Storage = one JSON file per map, `{id}.json`, on disk. No database.
- **Undo/redo:** snapshot the full JSON state onto a stack. NOT a command pattern.
- **Auth:** none in MVP.

## Data model

Recursive tree via `children` (no flat node map in MVP). Node: `{ "id", "text", "note", "collapsed", "children": [] }`. `note` is an optional longer free-text description per node (added beyond the original spec), edited in a modal dialog (Alt+Enter on the focused node, or the detail panel's Edit button), trimmed on serialization, empty when unset. Nodes with a note show a 🗒 marker after their text — a separate non-editable `.note-mark` span sharing a flex `.row` with the contenteditable `.node` (kept out of the editable so typing never displaces it; clicking it opens the description). The focused node's `note` is shown in a right-hand detail panel rendered as **basic Markdown** by a small in-house renderer (`renderMarkdown` in `app.js`: headings, bold/italic, code, links, lists, blockquotes; HTML-escaped first). This renderer is a deliberate placeholder — it is to be replaced later by the Ujorm library's Markdown rendering. Document: `{ "version": 1, "rootId", "root": {…} }`. `id` is a short random string generated on the client (`"n_" + base36`). `collapsed` only controls display of children; data is retained.

## Servlet API (phase 1)

| Method | Path | Body | Response |
|---|---|---|---|
| `GET`  | `/api/map/{id}` | — | Document JSON (or empty root if it doesn't exist) |
| `POST` | `/api/map/{id}` | Document JSON | `200 OK` |
| `GET`  | `/api/map/{id}/export?format=json` | — | File download (phase 2: `svg`, `png`) |

Server is stateless — no session. `{id}.json` lives in a configured directory.

## Build order (optimized for fastest running state)

- **Phase 0 — clickable prototype, no Java.** Standalone HTML/JS/CSS: outliner, all keyboard shortcuts, undo/redo, in-memory JSON serialization (an "Export JSON" button into a textarea). **This is the largest part of the work** — the interaction and edge cases are ironed out here before any backend exists.
- **Phase 1 — persistence.** Add the three servlets; frontend does `load` on start and debounced `save` on change, replacing the in-memory export with API calls.
- **Phase 2 — optional add-ons (separate iterations):** SVG connector overlay computed from `getBoundingClientRect()`, collapse/expand buttons, SVG/PNG export, `.mm` (FreeMind/Freeplane) import/export, node icons/colors.

## Keyboard model (core UX — low-mouse)

`Enter` = new sibling below current + focus it; `Tab` = indent (become child of previous sibling); `Shift+Tab` = outdent (become sibling of parent); `↑`/`↓` = focus prev/next visible node; `Alt+↑`/`Alt+↓` = reorder the node among its siblings (no-op at the ends; added beyond the original spec); `Backspace` on empty node = delete, focus previous, reparent its children to the parent; `Ctrl+Z` / `Ctrl+Shift+Z` = undo/redo.

## Predecided edge cases (honor these — they exist to save iterations)

- `Shift+Tab` on a node directly under root: no-op (don't crash).
- `Tab` on the first sibling (no previous sibling): no-op.
- Deleting the root: forbidden; root is always present.
- Empty node serializes as `text: ""` (allowed).
- Reading `contenteditable` text: use `element.innerText`, not `innerHTML`; trim, replace ` ` with space, ignore injected `<br>`/`<div>`.
- Paste: intercept `paste`, insert plain text only (`clipboardData.getData('text/plain')`), prevent default HTML paste.
- IME/diacritics: don't act on `keydown` while `event.isComposing` is true.

## Explicitly out of scope (MVP)

Real-time collaboration, multi-user, cloud sync, mobile gestures, mouse drag-and-drop reorg (keyboard only for now), pixel positioning, custom layout algorithm, DB, auth.

## Code conventions (from the spec)

- **Build:** Maven project, Java 17, with a Maven Wrapper (`mvnw`) committed at the project root. Once scaffolded, typical commands: `./mvnw package`, `./mvnw test`, single test via `./mvnw test -Dtest=ClassName#method`.
- **Servlet implementation:** use the `Element` class from the `ujo-web` module of the Ujorm library — see https://github.com/pponec/ujorm/blob/ujorm3/README_ELEMENT.md
- **Java:** use `var` for locals; English names and comments; JavaDoc comment above each method. Prefer `switch` over `if` where applicable.
- **Logging:** use the standard logging library; default level WARNING.
- **JS:** vanilla, no dependencies, English comments.
- **Single source of truth for the tree; render is a pure function of state (`renderTree(doc)`).**

## Working with the spec author

The author cannot see the running app — most real time is the test loop. When reporting a bug, state: (1) what you did, (2) what happened, (3) what you expected — and include the exported JSON when structure is involved.
