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

/** Create a fresh node with the given text (empty by default). */
function makeNode(text) {
  return { id: genId(), text: text || '', note: '', collapsed: false, children: [] };
}

/** Build the initial empty document. `id` is a stable, hidden project id
 *  (unused in Phase 0 — the file is the identity — but carried in the JSON
 *  so Phase 1 can address the map as /api/map/{id}). The root text doubles
 *  as the human project name and the suggested file name. */
function newDocument() {
  const root = makeNode('Untitled');
  root.id = 'n_root';
  return { version: 1, id: 'm_' + Math.random().toString(36).slice(2, 10), rootId: root.id, root: root };
}

/** Ensure a loaded document has a project id (older files may lack one). */
function ensureDocId(d) {
  if (d && !d.id) d.id = 'm_' + Math.random().toString(36).slice(2, 10);
  return d;
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
      // Alt+Enter opens the node's description dialog instead of a new sibling.
      if (e.altKey) openNoteDialog(id);
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

  const path = findPath(doc.root, id);
  if (path) path[path.length - 1].text = readNodeText(el);
  currentId = id;
  // Keep the detail panel's heading in sync while the title is edited.
  detailTitleEl.textContent = readNodeText(el).trim();
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
    const path = findPath(doc.root, toggle.dataset.toggle);
    if (!path) return;
    const node = path[path.length - 1];
    node.collapsed = !node.collapsed;
    currentId = node.id;
    currentOffset = Infinity;
    render();
    return;
  }

  const mark = e.target.closest('.note-mark');
  if (mark) {
    const nodeDiv = mark.parentElement.querySelector('.node');
    if (nodeDiv) openNoteDialog(nodeDiv.dataset.id);
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
/* Node description dialog                                                 */
/* ---------------------------------------------------------------------- */

const noteDialog = document.getElementById('note-dialog');
const noteTitleEl = document.getElementById('note-title');
const noteTextEl = document.getElementById('note-text');
let noteEditingId = null; // node whose description is being edited

/** Open the modal description editor for the given node. */
function openNoteDialog(id) {
  const path = findPath(doc.root, id);
  if (!path) return;
  const node = path[path.length - 1];
  noteEditingId = id;
  noteTitleEl.textContent = node.text.trim() || '(untitled node)';
  noteTextEl.value = node.note || '';
  noteDialog.showModal();
  noteTextEl.focus();
}

// Keyboard shortcut inside the editor: Ctrl/Cmd+Enter saves and closes
// (reusing the dialog's "save" path). Plain Enter stays a newline, and Esc
// keeps its native cancel behaviour.
noteDialog.addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    noteDialog.close('save');
  }
});

// On close, persist only when the user chose "Save" and the text changed.
noteDialog.addEventListener('close', () => {
  const id = noteEditingId;
  noteEditingId = null;
  if (id && noteDialog.returnValue === 'save') {
    const path = findPath(doc.root, id);
    if (path) {
      const node = path[path.length - 1];
      const next = noteTextEl.value.replace(/\r/g, '');
      if ((node.note || '') !== next) {
        endTextBurst();
        snapshot();
        node.note = next;
      }
    }
    currentId = id;
  }
  render(); // refresh the description marker and restore focus to the node
});

/* ---------------------------------------------------------------------- */
/* Detail panel — renders the focused node's description as Markdown       */
/* ---------------------------------------------------------------------- */

/*
 * Intentionally minimal Markdown: headings, bold/italic, inline code, links,
 * unordered/ordered lists, blockquotes, paragraphs. A richer renderer from
 * the Ujorm library will replace this later. Input is HTML-escaped first, so
 * note text can never inject markup.
 */

const detailTitleEl = document.getElementById('detail-title');
const detailBodyEl = document.getElementById('detail-body');

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;'); // keep quotes safe inside link href attributes
}

/** Apply inline Markdown to an already HTML-escaped line. */
function renderInline(s) {
  const codes = [];
  // Protect `code` spans from bold/italic processing.
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return '\uE000' + (codes.length - 1) + '\uE000';
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Links: only http(s) targets are allowed by the pattern.
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  s = s.replace(/\uE000(\d+)\uE000/g, (_, i) => '<code>' + codes[+i] + '</code>');
  return s;
}

/** Convert a Markdown string to a small, safe HTML subset. */
function renderMarkdown(md) {
  const lines = escapeHtml(md).split(/\n/);
  let html = '';
  let listType = null; // 'ul' | 'ol' | null
  const para = [];

  const closeList = () => {
    if (listType) {
      html += '</' + listType + '>';
      listType = null;
    }
  };
  const flushPara = () => {
    if (para.length) {
      html += '<p>' + renderInline(para.join(' ')) + '</p>';
      para.length = 0;
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    let m;
    if (line.trim() === '') {
      flushPara();
      closeList();
    } else if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      flushPara();
      closeList();
      const lvl = m[1].length;
      html += '<h' + lvl + '>' + renderInline(m[2]) + '</h' + lvl + '>';
    } else if ((m = line.match(/^\s*>\s?(.*)$/))) {
      flushPara();
      closeList();
      html += '<blockquote>' + renderInline(m[1]) + '</blockquote>';
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flushPara();
      if (listType !== 'ul') {
        closeList();
        html += '<ul>';
        listType = 'ul';
      }
      html += '<li>' + renderInline(m[1]) + '</li>';
    } else if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
      flushPara();
      if (listType !== 'ol') {
        closeList();
        html += '<ol>';
        listType = 'ol';
      }
      html += '<li>' + renderInline(m[1]) + '</li>';
    } else {
      para.push(line);
    }
  }
  flushPara();
  closeList();
  return html;
}

/** Refresh the right-hand panel to show the focused node's description. */
function updateDetail() {
  const path = findPath(doc.root, currentId);
  const node = path ? path[path.length - 1] : doc.root;
  detailTitleEl.textContent = (node.text || '').trim();
  const note = (node.note || '').trim();
  if (note) {
    detailBodyEl.innerHTML = renderMarkdown(note);
    detailBodyEl.classList.remove('empty');
  } else {
    detailBodyEl.innerHTML =
      '<p class="hint">No description yet. Click ' +
      '<strong>Edit</strong> above or press <kbd>Alt</kbd>+<kbd>Enter</kbd>.</p>';
    detailBodyEl.classList.add('empty');
  }
}

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

// The file name is the unique project key. Each named project auto-saves under
// its own key; an unnamed (New) document uses the scratch key. LAST_KEY records
// which project to restore on the next visit.
const SCRATCH_KEY = 'umind:doc';
const PROJECT_PREFIX = 'umind:file:';
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

/** localStorage key for the active project (its file name, or the scratch key). */
function activeStorageKey() {
  return currentFileName ? PROJECT_PREFIX + currentFileName : SCRATCH_KEY;
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

/* ---- Projects: New / Open / Save / Save As ----
   The FILE NAME is the unique project key (currentFileName). New starts a
   fresh unnamed project; Save As asks for a name (the OS dialog on Chromium,
   otherwise a prompt) and binds it; Save writes back to that name; if there is
   no name yet, Save falls through to Save As. When the File System Access API
   is available the real .json file is written directly; otherwise the project
   lives in localStorage under its name and Save As also downloads the file. */

const canFsAccess = 'showSaveFilePicker' in window; // secure context only
let fileHandle = null; // real-file handle when available (null in fallback)
let currentFileName = null; // the project's file name = its unique key

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

/** Show the current project's file name (or that it is not named yet). */
function updateFileLabel() {
  if (!fileNameEl) return;
  fileNameEl.textContent = currentFileName || '(unsaved)';
  fileNameEl.classList.toggle('unbound', !currentFileName);
  fileNameEl.title = !currentFileName
    ? 'Not saved yet — use Save As'
    : fileHandle
      ? 'Written to the file ' + currentFileName + ' on disk'
      : currentFileName +
        ' — stored in this browser. For a real file on disk, run locally in ' +
        'Chrome (python3 run.py) and use Save As.';
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

/** Save to the current project file; if unnamed, behave like Save As. */
async function saveFile() {
  if (!currentFileName) return saveFileAs();
  persistProject(); // keep the in-browser copy current
  if (canFsAccess && fileHandle) {
    try {
      await writeHandle(fileHandle, serialise());
      setStatus('saved to file');
      return;
    } catch (e) {
      console.warn('File save failed:', e);
    }
  }
  setStatus('saved in browser'); // no disk access here (e.g. sandbox/no FS API)
}

/** Save As: name the project (its unique key) and write it out. */
async function saveFileAs() {
  const json = serialise();
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
      console.warn('Save As picker failed, falling back to prompt:', e);
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

  currentFileName = name;
  fileHandle = handle; // may be null (fallback)
  persistProject();
  updateFileLabel();
  if (handle) {
    await writeHandle(handle, json);
    setStatus('saved to file');
  } else {
    downloadJson(json, name); // real file in a normal browser; no-op in sandbox
    setStatus('saved in browser');
  }
}

/** Fallback save: trigger a browser download (works under file:// too). */
function downloadJson(json, name) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name || 'untitled.json';
  a.click();
  URL.revokeObjectURL(url);
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
    const path = findPath(doc.root, draggedId);
    draggedNode = path ? path[path.length - 1] : null;
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
      const path = findPath(doc.root, targetId);
      const targetNode = path ? path[path.length - 1] : null;
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
document
  .getElementById('detail-edit')
  .addEventListener('click', () => openNoteDialog(currentId));

// Boot: restore the last-open project from localStorage (if any), then render.
storageOk = storageAvailable();
if (storageOk) {
  const lastName = localStorage.getItem(LAST_KEY) || '';
  const restored = readStoredDoc(lastName ? PROJECT_PREFIX + lastName : SCRATCH_KEY);
  if (restored) {
    doc = ensureDocId(restored);
    currentFileName = lastName || null;
    currentId = doc.rootId;
  }
}
render();
updateFileLabel();
booted = true;
if (!storageOk) {
  setStatus('autosave off');
  statusEl.title = 'localStorage is unavailable (e.g. opened via file://). ' +
    'Use Save As to keep a .json file, or serve over http for autosave.';
} else {
  setStatus(currentFileName ? 'loaded' : 'ready');
}
