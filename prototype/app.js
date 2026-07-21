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

/** Build the initial empty document (a single central-topic root). */
function newDocument() {
  const root = makeNode('Central topic');
  root.id = 'n_root';
  return { version: 1, rootId: root.id, root: root };
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

const outlineEl = document.getElementById('outline');
const statusEl = document.getElementById('status');
const fileInput = document.getElementById('file-input');

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
    { version: doc.version, rootId: doc.rootId, root: trimTree(doc.root) },
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
    snapshot();
    doc = parsed;
    currentId = doc.rootId;
    currentOffset = 0;
    render(); // also schedules a localStorage save
    setStatus('opened' + (source ? ' ' + source : ''));
    return true;
  } catch (err) {
    setStatus('invalid file');
    console.warn('Open failed:', err);
    return false;
  }
}

/* ---- localStorage auto-save ---- */

const STORAGE_KEY = 'umind:doc';
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

/** Debounced auto-save of the whole document to localStorage. */
function scheduleSave() {
  if (!storageOk) return;
  setStatus('editing…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serialise());
      setStatus('saved');
    } catch (e) {
      setStatus('save failed');
      console.warn('localStorage save failed:', e);
    }
  }, 500);
}

/** Read the stored document, or null when absent/invalid. */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.root && parsed.rootId) return parsed;
  } catch (e) {
    console.warn('localStorage load failed:', e);
  }
  return null;
}

/* ---- Real-file Open/Save ---- */

const canFsAccess = 'showSaveFilePicker' in window; // secure context only
let fileHandle = null; // reused so repeated saves overwrite the same file

/** Save the document to a real umind.json file (or download as fallback). */
async function saveFile() {
  const json = serialise();
  if (canFsAccess) {
    try {
      if (!fileHandle) {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: 'umind.json',
          types: [{ description: 'UMind map', accept: { 'application/json': ['.json'] } }],
        });
      }
      const writable = await fileHandle.createWritable();
      await writable.write(json);
      await writable.close();
      setStatus('saved to file');
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // user cancelled the picker
      console.warn('File save failed, falling back to download:', e);
    }
  }
  downloadJson(json);
  setStatus('downloaded');
}

/** Fallback save: trigger a browser download (works under file:// too). */
function downloadJson(json) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'umind.json';
  a.click();
  URL.revokeObjectURL(url);
}

/** Open a umind.json file, replacing the current document. */
async function openFile() {
  if (canFsAccess) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'UMind map', accept: { 'application/json': ['.json'] } }],
      });
      fileHandle = handle; // subsequent Save overwrites this file
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

// Fallback file-input change handler.
fileInput.addEventListener('change', () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
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
/* Wire up the toolbar and boot                                           */
/* ---------------------------------------------------------------------- */

document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);
document.getElementById('btn-open').addEventListener('click', openFile);
document.getElementById('btn-save').addEventListener('click', saveFile);
document
  .getElementById('detail-edit')
  .addEventListener('click', () => openNoteDialog(currentId));

// Boot: restore the last document from localStorage (if any), then render.
storageOk = storageAvailable();
const restored = storageOk ? loadFromStorage() : null;
if (restored) {
  doc = restored;
  currentId = doc.rootId;
}
render();
booted = true;
if (!storageOk) {
  setStatus('autosave off');
  statusEl.title = 'localStorage is unavailable (e.g. opened via file://). ' +
    'Use Save to keep a umind.json file, or serve over http for autosave.';
} else {
  setStatus(restored ? 'loaded' : 'saved');
}
