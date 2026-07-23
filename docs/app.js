/*
 * UMind — Phase 0 outliner prototype (vanilla JS, no dependencies).
 *
 * Single source of truth: the `doc` object. `render()` is a pure function of
 * state that rebuilds the DOM. Structural edits mutate `doc`, snapshot for
 * undo, then re-render. Plain typing syncs text into `doc` without a re-render
 * so the caret is never disturbed.
 *
 * See assignment.md §3 (data model), §4 (keys), §5 (edge cases).
 */
'use strict';

/* ---------------------------------------------------------------------- */
/* Data model                                                             */
/* ---------------------------------------------------------------------- */

/** Generate a short, client-side node id, e.g. "n_3f9k". */
function genId() {
  return 'n_' + Math.random().toString(36).slice(2, 8);
}

/** Generate a stable, hidden project id, e.g. "m_3f9k1z". */
function genMapId() {
  return 'm_' + Math.random().toString(36).slice(2, 10);
}

/** Create a fresh node with the given text (empty by default). */
function makeNode(text) {
  return { id: genId(), text: text || '', note: '', collapsed: false, children: [] };
}

/** Wrap a freshly-built tree as a document: pin the root id and attach a
 *  project id. `id` is a stable, hidden project id (unused in Phase 0 — the
 *  file is the identity — but carried in the JSON so Phase 1 can address the
 *  map as /api/map/{id}). */
function wrapDocument(root) {
  root.id = 'n_root';
  return { version: 1, id: genMapId(), rootId: root.id, root: root };
}

/** Build the initial empty document. The root text doubles as the human
 *  project name and the suggested file name. */
function newDocument() {
  return wrapDocument(makeNode('Untitled'));
}

/** Ensure a loaded document has a project id (older files may lack one). */
function ensureDocId(d) {
  if (d && !d.id) d.id = genMapId();
  return d;
}

/** Build a document from a plain { text, note, children } tree spec (see
 *  welcome.js). Node ids are assigned here so the data file stays id-free. */
function buildDocFromTree(spec) {
  const build = (n) => {
    const node = makeNode(n.text || '');
    node.note = n.note || '';
    node.collapsed = Boolean(n.collapsed);
    node.children = (n.children || []).map(build);
    return node;
  };
  return wrapDocument(build(spec));
}

/** The document a brand-new visitor starts on: the welcome/instructions map
 *  when welcome.js is present, otherwise a blank project.
 *  The welcome map is ephemeral — it carries a non-serialised `isWelcome` flag
 *  so auto-save skips it (scheduleSave); it therefore re-seeds fresh from
 *  welcome.js on every visit until the user picks New/Open or names it via
 *  Save As (which clears the flag). This keeps welcome.js the single source of
 *  truth and never leaves a stale greeting in localStorage. */
function starterDocument() {
  if (typeof window.WELCOME_TREE === 'undefined') return newDocument();
  const doc = buildDocFromTree(window.WELCOME_TREE);
  doc.isWelcome = true; // never persisted; re-seeded each boot (see scheduleSave)
  return doc;
}

/** Deep clone a plain-data value (used for undo snapshots). */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Depth-first search returning the path of nodes from root to the node with
 * the given id, inclusive. Returns null when not found. The parent is
 * path[path.length - 2] and the grandparent path[path.length - 3].
 */
function findPath(root, id) {
  if (root.id === id) return [root];
  for (const child of root.children) {
    const sub = findPath(child, id);
    if (sub) return [root, ...sub];
  }
  return null;
}

/** The node with the given id, or null. Use findPath directly when the parent
 *  or grandparent is also needed. */
function nodeById(id) {
  const path = findPath(doc.root, id);
  return path ? path[path.length - 1] : null;
}

/* ---------------------------------------------------------------------- */
/* State                                                                  */
/* ---------------------------------------------------------------------- */

let doc = newDocument();
const undoStack = [];
const redoStack = [];

let currentId = doc.rootId;   // id of the node that should hold focus
let currentOffset = 0;        // caret offset to restore after a re-render

// Text-edit coalescing: a burst of typing produces a single undo entry.
let textBurst = false;
let textBurstTimer = null;

// Set true once the initial load+render is done, so auto-save doesn't fire
// while restoring state at startup.
let booted = false;

// Feature flag for drag-and-drop reordering. Set to false to disable, or
// delete it together with the grip block in buildNodeLi, the "Drag and drop"
// section near the bottom, and the .drag-grip/.drop-* CSS to remove entirely.
const DND_ENABLED = true;

const outlineEl = document.getElementById('outline');
const statusEl = document.getElementById('status');
const fileInput = document.getElementById('file-input');
const fileNameEl = document.getElementById('file-name');

/* ---------------------------------------------------------------------- */
/* Text sanitising (assignment §5)                                        */
/* ---------------------------------------------------------------------- */

/** Read the plain text of a contenteditable node. Never trust innerHTML. */
function readNodeText(el) {
  // innerText already flattens <br>/<div> into newlines; nodes are single
  // logical lines, so collapse any stray newlines and normalise nbsp.
  return el.innerText.replace(/\u00a0/g, ' ').replace(/\n/g, '');
}

/* ---------------------------------------------------------------------- */
/* Undo / redo                                                            */
/* ---------------------------------------------------------------------- */

/** Push the current document state so it can be restored by undo. */
function snapshot() {
  undoStack.push(clone(doc));
  redoStack.length = 0;
  endTextBurst();
}

function endTextBurst() {
  textBurst = false;
  clearTimeout(textBurstTimer);
}

function undo() {
  if (!undoStack.length) return;
  endTextBurst();
  redoStack.push(clone(doc));
  doc = undoStack.pop();
  ensureCurrentExists();
  currentOffset = Infinity;
  render();
}

function redo() {
  if (!redoStack.length) return;
  endTextBurst();
  undoStack.push(clone(doc));
  doc = redoStack.pop();
  ensureCurrentExists();
  currentOffset = Infinity;
  render();
}

/** After undo/redo the focused node may be gone; fall back to the root. */
function ensureCurrentExists() {
  if (!findPath(doc.root, currentId)) currentId = doc.rootId;
}

/* ---------------------------------------------------------------------- */
/* Rendering (pure function of `doc`)                                     */
/* ---------------------------------------------------------------------- */

function buildNodeLi(node, isRoot) {
  const li = document.createElement('li');
  const hasChildren = node.children.length > 0;
  const hasNote = !!(node.note && node.note.trim());
  if (node.collapsed) li.classList.add('collapsed');

  // Collapse/expand toggle, shown only for branches that have children.
  if (hasChildren) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'toggle';
    toggle.dataset.toggle = node.id;
    toggle.textContent = node.collapsed ? '▸' : '▾';
    toggle.setAttribute('aria-expanded', String(!node.collapsed));
    toggle.setAttribute('aria-label', node.collapsed ? 'Expand branch' : 'Collapse branch');
    li.appendChild(toggle);
  }

  // The node text and its (optional) description marker share a flex row.
  // The marker is a separate, non-editable element kept OUT of the
  // contenteditable, so editing the title never disturbs or displaces it.
  const row = document.createElement('div');
  row.className = 'row';

  const div = document.createElement('div');
  div.className = 'node' + (isRoot ? ' root' : '') + (hasChildren ? ' has-children' : '');
  div.contentEditable = 'true';
  div.dataset.id = node.id;
  div.textContent = node.text;
  row.appendChild(div);

  if (hasNote) {
    const mark = document.createElement('span');
    mark.className = 'note-mark';
    mark.textContent = String.fromCodePoint(0x1f5d2) + '\uFE0E'; // 🗒 text-presentation
    mark.contentEditable = 'false';
    mark.title = 'Has a description — click to edit';
    mark.setAttribute('aria-label', 'Has a description');
    row.appendChild(mark);
  }

  // Drag handle in the gutter (removable: see DND_ENABLED). Root is not
  // draggable — it has no siblings or parent.
  if (DND_ENABLED && !isRoot) {
    const grip = document.createElement('span');
    grip.className = 'drag-grip';
    grip.draggable = true;
    grip.textContent = '⠿'; // ⠿ braille grip
    grip.title = 'Drag to move';
    grip.setAttribute('aria-hidden', 'true');
    row.appendChild(grip);
  }

  li.appendChild(row);

  if (!node.collapsed && hasChildren) {
    const ul = document.createElement('ul');
    for (const child of node.children) ul.appendChild(buildNodeLi(child, false));
    li.appendChild(ul);
  }
  return li;
}

function render() {
  const rootUl = document.createElement('ul');
  rootUl.className = 'outline-root';
  rootUl.appendChild(buildNodeLi(doc.root, true));
  outlineEl.replaceChildren(rootUl);
  restoreFocus();
  updateDetail();
  if (booted) scheduleSave(); // every structural change persists
}

/** Focus the node identified by `currentId` and place the caret. */
function restoreFocus() {
  const el = nodeEl(currentId) || nodeEl(doc.rootId);
  if (!el) return;
  el.focus();
  placeCaret(el, currentOffset);
}

/* ---------------------------------------------------------------------- */
/* Caret / selection helpers                                              */
/* ---------------------------------------------------------------------- */

function nodeEl(id) {
  return outlineEl.querySelector('.node[data-id="' + id + '"]');
}

/** Character offset of the caret inside the currently focused node. */
function caretOffset() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return 0;
  return sel.getRangeAt(0).startOffset;
}

/** Place the caret inside `el` at `offset` (clamped to the text length). */
function placeCaret(el, offset) {
  const sel = window.getSelection();
  const range = document.createRange();
  const textNode = el.firstChild;
  if (textNode && textNode.nodeType === Node.TEXT_NODE) {
    const pos = Math.min(offset, textNode.textContent.length);
    range.setStart(textNode, pos);
  } else {
    range.setStart(el, 0); // empty node
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** All currently visible node elements, in top-to-bottom document order. */
function visibleNodes() {
  return Array.from(outlineEl.querySelectorAll('.node'));
}

/* ---------------------------------------------------------------------- */
/* Structural operations (assignment §4 & §5)                             */
/* ---------------------------------------------------------------------- */

/** Enter: create a sibling below `id` and focus it. */
function insertSiblingAfter(id) {
  const path = findPath(doc.root, id);
  const node = path[path.length - 1];
  const parent = path[path.length - 2];
  snapshot();
  const fresh = makeNode('');
  if (!parent) {
    // On the root there is no sibling list; create a child instead (§2 has a
    // single root, so "sibling of root" is impossible — a new branch it is).
    node.children.push(fresh);
    node.collapsed = false;
  } else {
    const index = parent.children.indexOf(node);
    parent.children.splice(index + 1, 0, fresh);
  }
  currentId = fresh.id;
  currentOffset = 0;
  render();
}

/** Tab: make `id` a child of its previous sibling. No-op on the first child. */
function indent(id) {
  const path = findPath(doc.root, id);
  const parent = path[path.length - 2];
  if (!parent) return; // root cannot be indented
  const node = path[path.length - 1];
  const index = parent.children.indexOf(node);
  if (index === 0) return; // §5: no previous sibling -> no-op
  snapshot();
  const prev = parent.children[index - 1];
  parent.children.splice(index, 1);
  prev.collapsed = false;
  prev.children.push(node);
  currentId = id;
  render();
}

/** Shift+Tab: move `id` up a level, becoming a sibling of its parent. */
function outdent(id) {
  const path = findPath(doc.root, id);
  const parent = path[path.length - 2];
  const grandparent = path[path.length - 3];
  // §5: a node directly under the root has no grandparent -> no-op.
  if (!parent || !grandparent) return;
  snapshot();
  const node = path[path.length - 1];
  const parentIndex = grandparent.children.indexOf(parent);
  parent.children.splice(parent.children.indexOf(node), 1);
  grandparent.children.splice(parentIndex + 1, 0, node);
  currentId = id;
  render();
}

/** Alt+Arrow: reorder `id` among its siblings by `delta` (-1 up, +1 down). */
function moveSibling(id, delta) {
  const path = findPath(doc.root, id);
  const parent = path[path.length - 2];
  if (!parent) return; // root has no siblings
  const node = path[path.length - 1];
  const i = parent.children.indexOf(node);
  const j = i + delta;
  if (j < 0 || j >= parent.children.length) return; // at an end -> no-op
  currentOffset = caretOffset(); // keep the caret column across the move
  snapshot();
  parent.children.splice(i, 1);
  parent.children.splice(j, 0, node);
  currentId = id;
  render();
}

/** Backspace on an empty node: delete it, reparent its children, move focus. */
function deleteEmptyNode(id) {
  const path = findPath(doc.root, id);
  const parent = path[path.length - 2];
  if (!parent) return; // §5: the root may never be deleted
  const node = path[path.length - 1];

  // Focus target = the visually previous node (fall back to the parent).
  const order = visibleNodes().map((el) => el.dataset.id);
  const pos = order.indexOf(id);
  const focusTarget = pos > 0 ? order[pos - 1] : parent.id;

  snapshot();
  const index = parent.children.indexOf(node);
  // Splice the node's children into its place, preserving order.
  parent.children.splice(index, 1, ...node.children);
  currentId = focusTarget;
  currentOffset = Infinity;
  render();
}

/* ---------------------------------------------------------------------- */
/* Focus navigation (no state change, no re-render)                       */
/* ---------------------------------------------------------------------- */

function moveFocus(id, delta) {
  const els = visibleNodes();
  const pos = els.findIndex((el) => el.dataset.id === id);
  const target = els[pos + delta];
  if (!target) return;
  currentId = target.dataset.id;
  target.focus();
  placeCaret(target, Infinity); // caret at end of the target node
  updateDetail();
}

/* ---------------------------------------------------------------------- */
/* Event handling                                                         */
/* ---------------------------------------------------------------------- */

outlineEl.addEventListener('keydown', (e) => {
  // Do not interfere with IME composition (§5).
  if (e.isComposing) return;

  const el = e.target.closest('.node');
  if (!el) return;
  const id = el.dataset.id;

  switch (e.key) {
    case 'Enter':
      e.preventDefault();
      // Alt+Enter edits the node's description instead of adding a new sibling.
      if (e.altKey) enterNoteEdit(id);
      else insertSiblingAfter(id);
      return;

    case 'Tab':
      e.preventDefault();
      currentOffset = caretOffset(); // preserve caret column across the move
      if (e.shiftKey) outdent(id);
      else indent(id);
      return;

    case 'ArrowUp':
      e.preventDefault();
      if (e.altKey) moveSibling(id, -1); // reorder among siblings
      else moveFocus(id, -1);
      return;

    case 'ArrowDown':
      e.preventDefault();
      if (e.altKey) moveSibling(id, +1);
      else moveFocus(id, +1);
      return;

    case 'Backspace':
      // Only intercept when the node is empty; otherwise let the browser
      // delete a character (the input handler will sync the text).
      if (readNodeText(el) === '') {
        e.preventDefault();
        deleteEmptyNode(id);
      }
      return;

    case 'z':
    case 'Z':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      return;

    case 'y':
    case 'Y':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        redo();
      }
      return;

    default:
      return;
  }
});

// Live text sync. The first input of a typing burst snapshots the pre-edit
// state so undo rewinds a word/burst, not a single keystroke.
outlineEl.addEventListener('input', (e) => {
  const el = e.target.closest('.node');
  if (!el) return;
  const id = el.dataset.id;

  if (!textBurst) {
    undoStack.push(clone(doc)); // pre-edit state (doc still holds old text)
    redoStack.length = 0;
    textBurst = true;
  }
  clearTimeout(textBurstTimer);
  textBurstTimer = setTimeout(endTextBurst, 700);

  const text = readNodeText(el);
  const node = nodeById(id);
  if (node) node.text = text;
  currentId = id;
  // Keep the detail panel's heading in sync while the title is edited.
  detailTitleEl.textContent = text.trim();
  scheduleSave();
});

// Track the focused node so operations always act on the real caret target.
outlineEl.addEventListener('focusin', (e) => {
  const el = e.target.closest('.node');
  if (el) {
    currentId = el.dataset.id;
    updateDetail();
  }
});

// Clicks in the outline: toggle collapse, open a node's description via its
// marker, or focus the node when the empty part of its row is clicked.
outlineEl.addEventListener('click', (e) => {
  const toggle = e.target.closest('.toggle');
  if (toggle) {
    // Collapse/expand is view state, so it is not pushed onto the undo stack.
    const node = nodeById(toggle.dataset.toggle);
    if (!node) return;
    node.collapsed = !node.collapsed;
    currentId = node.id;
    currentOffset = Infinity;
    render();
    return;
  }

  const mark = e.target.closest('.note-mark');
  if (mark) {
    const nodeDiv = mark.parentElement.querySelector('.node');
    if (nodeDiv) {
      // Move focus to the marked row and show its note (rendered) in the
      // detail panel. Editing is a deliberate step (Edit button / Alt+Enter).
      currentId = nodeDiv.dataset.id;
      nodeDiv.focus();
      placeCaret(nodeDiv, Infinity);
      updateDetail();
    }
    return;
  }

  // Clicking the empty area of a row focuses its node (full-row target).
  if (e.target.classList.contains('row')) {
    const nodeDiv = e.target.querySelector('.node');
    if (nodeDiv) {
      nodeDiv.focus();
      placeCaret(nodeDiv, Infinity);
    }
  }
});


// Paste plain text only (§5): strip any HTML from the clipboard.
outlineEl.addEventListener('paste', (e) => {
  if (!e.target.closest('.node')) return;
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData)
    .getData('text/plain')
    .replace(/\r?\n/g, ' '); // keep nodes single-line
  document.execCommand('insertText', false, text);
});

/* ---------------------------------------------------------------------- */
/* Node description — inline editor inside the detail panel                */
/*                                                                        */
/* The description is edited in place in the detail panel (no modal). The */
/* panel swaps its rendered-Markdown body for a textarea while editing.   */
/* Robustness: the outline's keyboard shortcuts only fire on a focused    */
/* `.node`, so nothing in the tree reacts while the textarea has focus.   */
/* Leaving the textarea (blur — via Save, a click elsewhere, or focusing  */
/* another node) is the single commit signal; Cancel/Esc set a flag first */
/* so the same blur discards instead of saves.                            */
/* ---------------------------------------------------------------------- */

const detailEditBtn = document.getElementById('detail-edit');
const detailEditor = document.getElementById('detail-editor');
const detailNoteText = document.getElementById('detail-note-text');
const detailSaveBtn = document.getElementById('detail-save');
const detailCancelBtn = document.getElementById('detail-cancel');

let editingNoteId = null;   // node whose description is being edited in place
let cancelRequested = false; // set before blur when the user chose Cancel/Esc

/** Switch the detail panel into edit mode for the given node. */
function enterNoteEdit(id) {
  const node = nodeById(id);
  if (!node) return;
  editingNoteId = id;
  currentId = id;
  cancelRequested = false;
  detailTitleEl.textContent = node.text.trim() || '(untitled node)';
  detailBodyEl.hidden = true;
  detailEditBtn.hidden = true;
  detailEditor.hidden = false;
  // On mobile the .editing class grows the sheet (85vh) so the textarea and
  // keyboard have room; on desktop it is inert.
  detailEl.classList.add('editing');
  detailEl.classList.remove('collapsed', 'expanded');
  lastDetailId = id; // editing counts as "already shown", don't auto-collapse
  detailNoteText.value = node.note || '';
  detailNoteText.focus();
}

/** Restore the view-mode UI (shared by commit and cancel). */
function exitNoteEditUI() {
  editingNoteId = null;
  detailEditor.hidden = true;
  detailBodyEl.hidden = false;
  detailEditBtn.hidden = false;
  detailEl.classList.remove('editing');
}

/** Persist the edited note (when changed) and return to view mode. */
function commitNoteEdit() {
  if (editingNoteId === null) return;
  const id = editingNoteId;
  const node = nodeById(id);
  const next = detailNoteText.value.replace(/\r/g, '');
  exitNoteEditUI();
  if (node && (node.note || '') !== next) {
    endTextBurst();
    snapshot();
    node.note = next;
  }
  currentId = id;
  render(); // refresh the outline marker + detail view, focus the node
}

/** Discard edits and return to view mode. */
function cancelNoteEdit() {
  if (editingNoteId === null) return;
  const id = editingNoteId;
  exitNoteEditUI();
  currentId = id;
  render();
}

// Leaving the textarea is the universal commit signal — it fires whether the
// user clicked Save, tabbed away, clicked another node, or clicked a toolbar
// button. Cancel/Esc set cancelRequested first so this discards instead.
detailNoteText.addEventListener('blur', () => {
  if (editingNoteId === null) return;
  if (cancelRequested) { cancelRequested = false; cancelNoteEdit(); }
  else commitNoteEdit();
});

detailNoteText.addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    cancelRequested = true;
    detailNoteText.blur(); // triggers cancelNoteEdit via the blur handler
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    detailNoteText.blur(); // triggers commitNoteEdit via the blur handler
  }
});

// pointerdown fires before the textarea's blur, so it can flag the intent.
detailCancelBtn.addEventListener('pointerdown', () => { cancelRequested = true; });
detailCancelBtn.addEventListener('click', () => { if (editingNoteId !== null) cancelNoteEdit(); });
detailSaveBtn.addEventListener('click', () => { if (editingNoteId !== null) commitNoteEdit(); });

/* ---------------------------------------------------------------------- */
/* Detail panel — renders the focused node's description as Markdown       */
/* ---------------------------------------------------------------------- */

/*
 * Markdown rendering lives in markdown.js (a JS port of Ujorm's
 * MarkdownToHtmlConverter), loaded before this file. It exposes the global
 * renderMarkdown(md) \u2192 HTML string; the DOM-based renderer escapes all text,
 * so note content can never inject markup.
 */

const detailEl = document.getElementById('detail');
const detailTitleEl = document.getElementById('detail-title');
const detailBodyEl = document.getElementById('detail-body');

// Mobile: the detail panel is a bottom bar that expands into a full sheet.
// It is ALWAYS present for the focused node — collapsed it is a thin title bar
// carrying the Add/Edit button (so a note can always be started); expanded it
// shows the rendered note. On desktop these classes are inert: the side panel
// always shows everything.
const mobileSheetQuery = window.matchMedia('(max-width: 760px)');
function isMobileSheet() { return mobileSheetQuery.matches; }

let lastDetailId = null; // last node shown, so we only collapse on real moves

/** Refresh the detail panel for the focused node's description. */
function updateDetail() {
  // While the inline editor is open, never overwrite it (a stray render would
  // otherwise wipe the in-progress textarea).
  if (editingNoteId !== null) return;
  const node = nodeById(currentId) || doc.root;
  detailTitleEl.textContent = (node.text || '').trim();
  const note = (node.note || '').trim();
  if (note) {
    detailBodyEl.innerHTML = renderMarkdown(note);
    detailBodyEl.classList.remove('empty');
  } else {
    detailBodyEl.innerHTML =
      '<p class="hint">No description yet — press ' +
      '<strong>＋ Add</strong> or <kbd>Alt</kbd>+<kbd>Enter</kbd>.</p>';
    detailBodyEl.classList.add('empty');
  }
  // One button both adds (when empty) and edits (when a note exists).
  detailEditBtn.textContent = note ? 'Edit' : '＋ Add';
  // Reset the sheet to its content-fitting default when focus actually moves to
  // another node (drop any manual expand/collapse). Re-renders of the SAME node
  // (e.g. right after saving) keep whatever height state the user set.
  if (currentId !== lastDetailId) {
    detailEl.classList.remove('expanded', 'collapsed');
    lastDetailId = currentId;
    revealFocusedRow();
  }
}

/** On mobile, nudge the focused row up if it would sit behind the sheet. The
 *  browser's own focus scroll treats a row hidden behind the fixed sheet as
 *  "visible" and won't move it, so we do it explicitly — but only when the row
 *  actually overlaps the sheet, and by the minimum amount, so it never jumps.
 *  Uses the sheet's live top, so it tracks whatever height the content gives. */
function revealFocusedRow() {
  if (!isMobileSheet()) return;
  const el = nodeEl(currentId);
  if (!el) return;
  const sheetTop = detailEl.getBoundingClientRect().top - 8; // small gap
  const overlap = el.getBoundingClientRect().bottom - sheetTop;
  if (overlap > 0) window.scrollBy(0, Math.ceil(overlap));
}

/** Collapse the sheet to a bar, or restore it to the content-fitting default
 *  (inert on desktop). Used by a plain tap on the grip or title. */
function toggleDetail() {
  if (detailEl.classList.contains('collapsed')) {
    detailEl.classList.remove('collapsed');
  } else {
    detailEl.classList.add('collapsed');
    detailEl.classList.remove('expanded');
  }
}

// Tapping the title collapses/restores the sheet on mobile (a quick way to get
// the tree back, and to bring the note back again).
detailTitleEl.addEventListener('click', () => { if (isMobileSheet()) toggleDetail(); });

// The grip drags the sheet's height: up to grow (read a long note / edit), down
// to shrink to a bar; a plain tap collapses/restores. On release it snaps to
// the nearest of collapsed / content-default / expanded. Pointer events unify
// mouse and touch; capture + preventDefault stop the drag from selecting text.
const detailGrip = document.getElementById('detail-grip');
const COLLAPSED_H = 64; // px height of the collapsed bar (matches CSS)
let gripStartY = null, gripStartH = 0, gripHeight = 0, gripMoved = false;

detailGrip.addEventListener('pointerdown', (e) => {
  gripStartY = e.clientY;
  gripStartH = detailEl.offsetHeight;
  gripHeight = gripStartH;
  gripMoved = false;
  try { detailGrip.setPointerCapture(e.pointerId); } catch (_) { /* non-fatal */ }
  detailEl.style.transition = 'none'; // follow the finger with no lag
  e.preventDefault(); // no text selection while dragging the handle
});
detailGrip.addEventListener('pointermove', (e) => {
  if (gripStartY === null) return;
  const dy = gripStartY - e.clientY; // dragging up grows the sheet
  if (Math.abs(dy) > 6) gripMoved = true;
  const maxPx = Math.round(window.innerHeight * 0.85);
  gripHeight = Math.min(maxPx, Math.max(COLLAPSED_H, gripStartH + dy));
  // Drive an explicit height (not just max-height): the sheet is content-fit
  // (height: auto), so raising max-height alone would never grow it past the
  // note. Setting height makes the box follow the finger up beyond the content.
  detailEl.style.height = gripHeight + 'px';
  detailEl.style.maxHeight = gripHeight + 'px';
});
detailGrip.addEventListener('pointerup', () => {
  if (gripStartY === null) return;
  gripStartY = null;
  detailEl.style.transition = ''; // restore the CSS snap animation
  detailEl.style.height = '';     // hand height back to the CSS classes
  detailEl.style.maxHeight = '';
  if (!gripMoved) { toggleDetail(); return; } // a tap collapses/restores
  // A real drag snaps to the nearest of collapsed / default (content, ≤50vh) /
  // expanded, starting from a clean slate.
  detailEl.classList.remove('collapsed', 'expanded');
  const vh = window.innerHeight;
  if (gripHeight <= vh * 0.22) detailEl.classList.add('collapsed');
  else if (gripHeight >= vh * 0.6) detailEl.classList.add('expanded');
  // else: leave both off → the content-fitting default.
});

/* ---------------------------------------------------------------------- */
/* Persistence (Phase 0 stand-in for the server)                          */
/*                                                                        */
/* Two layers:                                                            */
/*   1. Auto-save to localStorage (debounced) so state survives a restart */
/*      with zero user effort. Reliable when served over http(s) or       */
/*      localhost; under file:// the origin is opaque and it may not      */
/*      persist, hence the file layer below.                              */
/*   2. Explicit Open/Save of a real umind.json file for backup and for   */
/*      moving a map between machines. Uses the File System Access API on  */
/*      Chromium; elsewhere (and under file://) it falls back to a         */
/*      download and a file picker.                                        */
/* ---------------------------------------------------------------------- */

/** Serialise the document, trimming node text (§5: trim on serialisation). */
function serialise() {
  const trimTree = (node) => ({
    id: node.id,
    text: node.text.trim(),
    note: (node.note || '').trim(),
    collapsed: node.collapsed,
    children: node.children.map(trimTree),
  });
  return JSON.stringify(
    { version: doc.version, id: doc.id, rootId: doc.rootId, root: trimTree(doc.root) },
    null,
    2,
  );
}

/** Replace the current document from a JSON string (file or storage). */
function loadDocFromText(text, source) {
  try {
    const parsed = JSON.parse(text);
    if (!parsed.root || !parsed.rootId) throw new Error('missing root');
    endTextBurst();
    doc = ensureDocId(parsed);
    undoStack.length = 0; // history belongs to the previous document
    redoStack.length = 0;
    currentId = doc.rootId;
    currentOffset = 0;
    render(); // also schedules a localStorage save
    updateFileLabel();
    setStatus('opened' + (source ? ' ' + source : ''));
    return true;
  } catch (err) {
    setStatus('invalid file');
    console.warn('Open failed:', err);
    return false;
  }
}

/* ---- localStorage auto-save ---- */

// localStorage is the continuous working store (like an online image editor:
// your work is always kept in the browser). The project's name is the key
// identifier — or 'untitled' when it has none yet. Save / Save As are a
// separate concern: they EXPORT the project to a file on disk. LAST_KEY records
// which project to restore on the next visit.
const PROJECT_PREFIX = 'umind:project:';
const LAST_KEY = 'umind:last';
let storageOk = false;
let saveTimer = null;

/** Detect whether localStorage is usable (may be blocked under file://). */
function storageAvailable() {
  try {
    const k = '__umind_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch (e) {
    return false;
  }
}

/** localStorage key for the active project (its name, or 'untitled'). */
function activeStorageKey() {
  return PROJECT_PREFIX + (currentFileName || 'untitled');
}

/** Persist the document to its project key immediately (used by Save). */
function persistProject() {
  if (!storageOk) return;
  try {
    localStorage.setItem(activeStorageKey(), serialise());
    localStorage.setItem(LAST_KEY, currentFileName || '');
  } catch (e) {
    console.warn('localStorage save failed:', e);
  }
}

/** Debounced auto-save of the whole document to its project key. */
function scheduleSave() {
  if (!storageOk) return;
  // The welcome/instructions map is ephemeral: edits to it are a preview, not a
  // project, so they are not persisted. It becomes a real (saved) project only
  // via New/Open or Save As (which clears isWelcome). Until then it re-seeds
  // fresh from welcome.js on every visit.
  if (doc.isWelcome) { setStatus('preview'); return; }
  setStatus('editing…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persistProject();
    setStatus('saved');
  }, 500);
}

/** Read a stored document by localStorage key, or null when absent/invalid. */
function readStoredDoc(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.root && parsed.rootId) return parsed;
  } catch (e) {
    console.warn('localStorage load failed:', e);
  }
  return null;
}

/* ---- Projects & export: New / Open / Save / Save As ----
   Persistence is automatic (localStorage, above). These actions manage the
   project name and EXPORT a .json file to the user's disk:
     New     — start a fresh, unnamed project (kept in localStorage as untitled)
     Save As — name the project (its identifier) and export a file
     Save    — re-export using the current name; if unnamed, do Save As
     Open    — load a .json file as the current project
   Export uses the File System Access API when available (a real file on disk);
   otherwise it downloads the file. Naming still works everywhere (it only
   changes the localStorage key), even where disk export is blocked (sandbox). */

const canFsAccess = 'showSaveFilePicker' in window; // secure context only
let fileHandle = null; // real-file handle when available (null in fallback)
let currentFileName = null; // the project's name / identifier (localStorage key)

// Running inside a cross-origin iframe (e.g. the published artifact preview)?
// There, disk export is blocked no matter what, so we say so honestly.
const inIframe = (() => {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true; // cross-origin access threw -> we are framed
  }
})();

const FILE_TYPES = [
  { description: 'UMind map', accept: { 'application/json': ['.json'] } },
];

/** ASCII slug of the project title, used as the default file name. */
function slugify(s) {
  const base = (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'untitled';
}

function suggestedFileName() {
  return currentFileName || slugify(doc.root.text) + '.json';
}

/** Show the current project's file name (or that it is not named yet). It is
 *  also the moment the project's identity can change, so the address follows. */
function updateFileLabel() {
  syncUrlToProject();
  if (!fileNameEl) return;
  fileNameEl.textContent = currentFileName || '(unsaved)';
  fileNameEl.classList.toggle('unbound', !currentFileName);
  fileNameEl.title = currentFileName
    ? 'Project "' + currentFileName + '" — auto-saved in this browser. ' +
      'Save / Save As export a .json file to disk.'
    : 'Untitled — auto-saved in this browser. Use Save As to name and export it.';
}

async function writeHandle(handle, json) {
  const writable = await handle.createWritable();
  await writable.write(json);
  await writable.close();
}

/* In-app name prompt (window.prompt is blocked in sandboxed iframes such as
   the published artifact). Resolves to the entered name, or null if cancelled. */
const nameDialog = document.getElementById('name-dialog');
const nameInput = document.getElementById('name-input');
document
  .getElementById('name-cancel')
  .addEventListener('click', () => nameDialog.close('cancel'));

function askName(def) {
  return new Promise((resolve) => {
    nameInput.value = def || '';
    const onClose = () => {
      nameDialog.removeEventListener('close', onClose);
      resolve(nameDialog.returnValue === 'ok' ? nameInput.value : null);
    };
    nameDialog.addEventListener('close', onClose);
    nameDialog.showModal();
    nameInput.focus();
    nameInput.select();
  });
}

/** Export the current project to disk under its name; if unnamed, do Save As. */
async function saveFile() {
  if (!currentFileName) return saveFileAs();
  const json = serialise();
  if (canFsAccess && fileHandle) {
    try {
      await writeHandle(fileHandle, json);
      setStatus('exported to file');
      return;
    } catch (e) {
      console.warn('Export failed:', e);
    }
  }
  exportDownload(json, currentFileName);
}

/** Save As: name the project (its identifier) and export a file. */
async function saveFileAs() {
  let name = null;
  let handle = null;

  if (canFsAccess) {
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: suggestedFileName(),
        types: FILE_TYPES,
      });
      name = handle.name;
    } catch (e) {
      if (e.name === 'AbortError') return; // user cancelled
      console.warn('Save As picker failed, falling back to a name dialog:', e);
    }
  }
  if (!name) {
    // In-app name dialog (window.prompt is blocked in sandboxed iframes).
    const entered = await askName(suggestedFileName());
    if (entered === null) return; // cancelled
    name = entered.trim();
    if (!name) return;
    if (!/\.json$/i.test(name)) name += '.json';
  }

  currentFileName = name; // the identifier (also the localStorage key)
  fileHandle = handle; // may be null (fallback)
  delete doc.isWelcome; // naming it makes it a real project: enable persistence
  persistProject(); // move the working copy to the new name's key immediately
  updateFileLabel();

  const json = serialise();
  if (handle) {
    await writeHandle(handle, json);
    setStatus('exported to file');
  } else {
    exportDownload(json, name);
  }
}

/** Download a file and report honestly (blocked inside the artifact preview). */
function exportDownload(json, name) {
  if (inIframe) {
    // Sandboxed preview: downloads are blocked. Don't pretend otherwise.
    setStatus('open in a tab to export');
    return;
  }
  downloadJson(json, name);
  setStatus('downloaded');
}

/** Fallback export: trigger a browser download. The anchor must be in the DOM
 *  (Firefox) and the object URL must be revoked *later* — revoking it right
 *  after click() cancels the download in several browsers. */
function downloadJson(json, name) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name || 'untitled.json';
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Open a file, switching to it as the current project. */
async function openFile() {
  if (canFsAccess) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: FILE_TYPES });
      fileHandle = handle;
      currentFileName = handle.name; // the file name becomes the project key
      const file = await handle.getFile();
      loadDocFromText(await file.text(), 'from file');
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.warn('File open failed, falling back to picker:', e);
    }
  }
  fileInput.click(); // fallback: hidden <input type="file">
}

/** New: start a fresh, unnamed project. The current project is already kept
 *  in localStorage under its own key, so nothing saved is lost. */
function newFile() {
  endTextBurst();
  doc = newDocument();
  fileHandle = null;
  currentFileName = null; // unnamed until Save As
  undoStack.length = 0;
  redoStack.length = 0;
  currentId = doc.rootId;
  currentOffset = 0;
  render();
  updateFileLabel();
  setStatus('new project');
}

/* ---------------------------------------------------------------------- */
/* URL: which project to open, and in which view                          */
/*                                                                        */
/* The address is a single, valueless query key: the project's own         */
/* localStorage name, optionally with a "/svg" tail asking for the picture */
/* instead of the outliner. Deleting that tail therefore lands you in the  */
/* editor of the same map.                                                 */
/*                                                                        */
/*   .../             the last project used here (as before)              */
/*   .../?my-map      the project stored under "my-map"                    */
/*   .../?my-map/svg  its graph view                                       */
/*   .../?welcome     the greeting: always fresh, never saved (reserved)   */
/*   .../?welcome/svg the greeting as a picture                            */
/* ---------------------------------------------------------------------- */

const WELCOME_KEY = 'welcome'; // reserved: the greeting, not a stored project
const GRAPH_SUFFIX = '/svg';

/** Read the address: { name, graph }. `name` is '' when nothing was asked for. */
function readUrlTarget() {
  const keys = [...new URLSearchParams(location.search).keys()];
  // Keep honouring ?welcome wherever it appears; otherwise the first key wins.
  const raw = keys.find((k) => k === WELCOME_KEY || k === WELCOME_KEY + GRAPH_SUFFIX)
    || keys[0] || '';
  const graph = raw.toLowerCase().endsWith(GRAPH_SUFFIX);
  return { name: graph ? raw.slice(0, -GRAPH_SUFFIX.length) : raw, graph: graph };
}

/** Keep the address pointing at the project actually open, so a reload or a
 *  shared link opens this map and not the one named before it was renamed.
 *  Never touches ?welcome, which cleans itself up at boot (see below). */
function syncUrlToProject() {
  if (graphView) return; // the graph URL is set by whoever navigated here
  try {
    const url = new URL(location.href);
    const target = readUrlTarget();
    if (!target.name || target.name === WELCOME_KEY) return; // nothing to keep in sync
    url.search = currentFileName ? '?' + encodeURIComponent(currentFileName) : '';
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch (e) {
    console.warn('Could not update the project URL:', e);
  }
}

/* ---------------------------------------------------------------------- */
/* Graph view                                                             */
/* ---------------------------------------------------------------------- */

let graphView = false; // true when this page shows the picture, not the tree

/** The project name to put in the picture's header and in its URL. */
function projectLabel() {
  if (doc.isWelcome) return WELCOME_KEY;
  return currentFileName || 'untitled';
}

/** Show graph: open the picture of this map in a new tab. The tab gets a real
 *  address (".../?project/svg") rather than a throw-away blob, so it can be
 *  reloaded, bookmarked and shared, and deleting "/svg" opens the editor.
 *  Without localStorage (file://) there is nothing for that address to read,
 *  and an unsaved greeting would render as the pristine welcome map, so both
 *  fall back to handing the finished SVG straight to a new tab. */
function exportSvgFile() {
  try {
    const name = suggestedFileName().replace(/\.json$/i, '') + '.svg';
    if (storageOk && !doc.isWelcome) {
      persistProject(); // flush the debounced save so the new tab sees this text
      const url = new URL(location.href);
      url.search = '?' + encodeURIComponent(projectLabel()) + GRAPH_SUFFIX;
      if (window.open(url.href, '_blank')) {
        setStatus('graph opened in a new tab');
        return;
      }
    }
    setStatus(exportSvg(doc, name, { project: projectLabel() })
      ? 'graph opened in a new tab' : 'svg downloaded');
  } catch (e) {
    console.warn('SVG export failed:', e);
    setStatus('svg export failed');
  }
}

/** Render the picture into the page and switch the toolbar to viewing mode. */
function showGraph() {
  graphView = true; // already true when the address asked for it (see boot)
  document.querySelector('.workspace').hidden = true;
  document.querySelector('.help').hidden = true;
  document.getElementById('graph').hidden = false;
  for (const id of ['btn-undo', 'btn-redo', 'btn-new', 'btn-open', 'btn-save',
    'btn-saveas', 'btn-svg']) {
    document.getElementById(id).hidden = true;
  }
  document.getElementById('btn-edit').hidden = false;
  document.getElementById('btn-svg-save').hidden = false;
  const svg = documentToSvg(doc, { project: projectLabel() });
  // The prolog belongs to a standalone file; here the markup is inlined.
  document.getElementById('graph-canvas').innerHTML =
    svg.replace(/^<\?xml[^>]*\?>\s*/, '');
  document.title = (doc.root.text || 'UMind').trim() + ' — graph';
  fileNameEl.textContent = projectLabel();   // the map being viewed, not "(unsaved)"
  fileNameEl.classList.remove('unbound');
  fileNameEl.title = 'Project shown in this picture';
  setStatus('graph');
}

/** Back to the editor: the same address without the "/svg" tail. */
function leaveGraph() {
  const url = new URL(location.href);
  url.search = '?' + encodeURIComponent(projectLabel());
  location.href = url.href;
}

/** Save the picture shown in the graph view as a file on disk. */
function downloadSvgFile() {
  const svg = documentToSvg(doc, { project: projectLabel() });
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = slugify(doc.root.text) + '.svg';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  setStatus('svg downloaded');
}

// Fallback file-input change handler (no File System Access API).
fileInput.addEventListener('change', () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  fileHandle = null; // fallback mode can't keep a writable handle
  currentFileName = file.name;
  const reader = new FileReader();
  reader.onload = () => loadDocFromText(String(reader.result), 'from file');
  reader.readAsText(file);
  fileInput.value = ''; // allow re-opening the same file later
});

/* ---------------------------------------------------------------------- */
/* Status line                                                            */
/* ---------------------------------------------------------------------- */

function setStatus(text) {
  statusEl.textContent = text;
}

/* ---------------------------------------------------------------------- */
/* Drag and drop (optional — gated entirely by DND_ENABLED)               */
/*                                                                        */
/* Drag a node by the gutter grip and drop it before/after another node   */
/* (any level), re-parenting as needed. Dropping onto the node itself,    */
/* into its own subtree, or as a sibling of the root is disallowed. To    */
/* remove the feature: delete this whole block, the grip block in         */
/* buildNodeLi, the DND_ENABLED flag, and the .drag-grip/.drop-* CSS.     */
/* ---------------------------------------------------------------------- */

if (DND_ENABLED) {
  let draggedId = null;
  let draggedNode = null;
  let markedRow = null; // row currently showing a drop indicator
  let dropPos = null; // 'before' | 'after'

  const containsId = (node, id) =>
    node.id === id || node.children.some((c) => containsId(c, id));

  const clearMark = () => {
    if (markedRow) markedRow.classList.remove('drop-before', 'drop-after', 'drop-into');
    markedRow = null;
    dropPos = null;
  };

  /** True when `targetId` cannot receive the dragged node. */
  const invalidTarget = (targetId) =>
    !targetId ||
    targetId === draggedId ||
    targetId === doc.rootId || // can't become a sibling of the root
    (draggedNode && containsId(draggedNode, targetId)); // no dropping into self

  outlineEl.addEventListener('dragstart', (e) => {
    const grip = e.target.closest('.drag-grip');
    if (!grip) return;
    const row = grip.closest('.row');
    draggedId = row.querySelector('.node').dataset.id;
    draggedNode = nodeById(draggedId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedId);
    row.classList.add('dragging');
  });

  outlineEl.addEventListener('dragover', (e) => {
    if (!draggedId) return;
    const row = e.target.closest('.row');
    if (!row) return clearMark();
    const targetId = row.querySelector('.node').dataset.id;
    if (invalidTarget(targetId)) return clearMark();

    e.preventDefault(); // permit the drop
    e.dataTransfer.dropEffect = 'move';
    const rect = row.getBoundingClientRect();
    const pos = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
    if (row !== markedRow || pos !== dropPos) {
      clearMark();
      markedRow = row;
      dropPos = pos;
      row.classList.add(pos === 'before' ? 'drop-before' : 'drop-after');
      // "after" an expanded branch drops as its first child — indent the hint.
      const targetNode = nodeById(targetId);
      if (pos === 'after' && targetNode && !targetNode.collapsed && targetNode.children.length) {
        row.classList.add('drop-into');
      }
    }
  });

  outlineEl.addEventListener('drop', (e) => {
    if (!draggedId || !markedRow) return clearMark();
    e.preventDefault();
    const targetId = markedRow.querySelector('.node').dataset.id;
    const pos = dropPos;
    clearMark();
    moveByDrop(draggedId, targetId, pos);
  });

  outlineEl.addEventListener('dragend', () => {
    const dragging = outlineEl.querySelector('.row.dragging');
    if (dragging) dragging.classList.remove('dragging');
    clearMark();
    draggedId = null;
    draggedNode = null;
  });

  /** Move `dragId` to just before/after `targetId` in the target's parent. */
  function moveByDrop(dragId, targetId, pos) {
    if (invalidTarget(targetId)) return;
    const dragPath = findPath(doc.root, dragId);
    const targetPath = findPath(doc.root, targetId);
    if (!dragPath || !targetPath) return;
    const dragged = dragPath[dragPath.length - 1];
    const dragParent = dragPath[dragPath.length - 2];
    const target = targetPath[targetPath.length - 1];
    const targetParent = targetPath[targetPath.length - 2];
    if (!dragParent || !targetParent) return;

    snapshot();
    dragParent.children.splice(dragParent.children.indexOf(dragged), 1);
    if (pos === 'after' && !target.collapsed && target.children.length) {
      // Dropping just below an expanded branch means "become its first child"
      // (visually the same spot as "before its first child").
      target.children.unshift(dragged);
    } else {
      // Recompute the index after removal (matters when parents are the same).
      let idx = targetParent.children.indexOf(target);
      if (pos === 'after') idx += 1;
      targetParent.children.splice(idx, 0, dragged);
    }
    currentId = dragId;
    currentOffset = Infinity;
    render();
  }
}

/* ---------------------------------------------------------------------- */
/* Wire up the toolbar and boot                                           */
/* ---------------------------------------------------------------------- */

document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);
document.getElementById('btn-new').addEventListener('click', newFile);
document.getElementById('btn-open').addEventListener('click', openFile);
document.getElementById('btn-save').addEventListener('click', saveFile);
document.getElementById('btn-saveas').addEventListener('click', saveFileAs);
document.getElementById('btn-svg').addEventListener('click', exportSvgFile);
document.getElementById('btn-edit').addEventListener('click', leaveGraph);
document.getElementById('btn-svg-save').addEventListener('click', downloadSvgFile);
detailEditBtn.addEventListener('click', () => enterNoteEdit(currentId));

// Clicking the toolbar logo opens it at full size; a click anywhere on the
// dialog (image or backdrop) or Esc closes it.
const logoDialog = document.getElementById('logo-dialog');
document.querySelector('.brand-logo').addEventListener('click', () => logoDialog.showModal());
logoDialog.addEventListener('click', () => logoDialog.close());

// Boot: restore the last-open project from localStorage (if any), else seed the
// welcome map for first-time visitors, then render.
storageOk = storageAvailable();

// URL flag: ?welcome (re)loads a fresh welcome map. It is non-destructive —
// the welcome map is ephemeral (not persisted), so the visitor's saved
// projects stay untouched and a plain reload returns to their work, which
// makes ?welcome safe to link publicly (e.g. from the README). The flag is
// stripped from the address bar so a later reload (e.g. after a Save As) does
// not re-trigger it.
const urlTarget = readUrlTarget();
graphView = urlTarget.graph; // set before anything can sync the address away
const forceWelcome = urlTarget.name === WELCOME_KEY;
// ?welcome is still self-cleaning, so a later reload or Save As does not
// re-trigger the greeting. The graph URL keeps its address: it is a view of a
// map, and dropping "/svg" from it is how you get to the editor.
if (forceWelcome && !urlTarget.graph) {
  try {
    const url = new URL(location.href);
    url.searchParams.delete(WELCOME_KEY);
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch (e) {
    console.warn('Could not clean the ?welcome URL:', e);
  }
}

// A name in the address opens that project instead of the last one used. It is
// only a starting point: when the project is missing we fall back to the normal
// restore rather than inventing an empty map under someone else's name.
let urlMissing = false;
if (!forceWelcome && urlTarget.name && storageOk) {
  const wanted = readStoredDoc(PROJECT_PREFIX + urlTarget.name);
  if (wanted) {
    doc = ensureDocId(wanted);
    currentFileName = urlTarget.name === 'untitled' ? null : urlTarget.name;
    currentId = doc.rootId;
  } else {
    urlMissing = true;
  }
}

if (forceWelcome) {
  // Forced greeting: ephemeral, re-seeded from welcome.js (see starterDocument).
  doc = starterDocument();
  currentId = doc.rootId;
} else if (urlTarget.name && !urlMissing) {
  // Already loaded from the address above.
} else if (storageOk) {
  const lastName = localStorage.getItem(LAST_KEY); // null = never saved here
  const restored = readStoredDoc(PROJECT_PREFIX + (lastName || 'untitled'));
  if (restored) {
    doc = ensureDocId(restored);
    currentFileName = lastName || null;
    currentId = doc.rootId;
  } else if (lastName === null) {
    // First-ever visit: greet with the instructions map instead of a blank one.
    // The welcome map is ephemeral (isWelcome flag) — not auto-saved, so it
    // re-seeds each visit until the user picks New/Open or names it via Save As.
    doc = starterDocument();
    currentId = doc.rootId;
  }
} else {
  // No persistence (e.g. file://): every load is fresh, so greet with the map.
  doc = starterDocument();
  currentId = doc.rootId;
}
if (urlTarget.graph) {
  updateFileLabel();
  booted = true;
  showGraph();
} else {
  render();
  updateFileLabel();
  booted = true;
  if (!storageOk) {
    setStatus('autosave off');
    statusEl.title = 'localStorage is unavailable (e.g. opened via file://). ' +
      'Use Save As to keep a .json file, or serve over http for autosave.';
  } else if (urlMissing) {
    setStatus('no project "' + urlTarget.name + '"');
  } else if (doc.isWelcome) {
    setStatus('preview'); // welcome map is not persisted (see scheduleSave)
  } else {
    setStatus(currentFileName ? 'loaded' : 'ready');
  }
}
