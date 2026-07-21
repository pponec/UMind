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

const outlineEl = document.getElementById('outline');
const statusEl = document.getElementById('status');
const jsonEl = document.getElementById('json');

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

  // Collapse/expand toggle, shown only for branches that have children. When
  // present it replaces the bullet, so it also carries the has-note accent.
  if (hasChildren) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'toggle' + (hasNote ? ' has-note' : '');
    toggle.dataset.toggle = node.id;
    toggle.textContent = node.collapsed ? '▸' : '▾';
    toggle.setAttribute('aria-expanded', String(!node.collapsed));
    toggle.setAttribute('aria-label', node.collapsed ? 'Expand branch' : 'Collapse branch');
    li.appendChild(toggle);
  }

  const div = document.createElement('div');
  // A leaf with a description gets a highlighted bullet (see .node.has-note);
  // editing happens through the detail panel's Edit button or Alt+Enter.
  div.className =
    'node' +
    (isRoot ? ' root' : '') +
    (hasChildren ? ' has-children' : '') +
    (hasNote ? ' has-note' : '');
  div.contentEditable = 'true';
  div.dataset.id = node.id;
  div.textContent = node.text;
  li.appendChild(div);

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
      moveFocus(id, -1);
      return;

    case 'ArrowDown':
      e.preventDefault();
      moveFocus(id, +1);
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
  markUnsaved();
});

// Track the focused node so operations always act on the real caret target.
outlineEl.addEventListener('focusin', (e) => {
  const el = e.target.closest('.node');
  if (el) {
    currentId = el.dataset.id;
    updateDetail();
  }
});

// Collapse/expand a branch when its toggle is clicked. This is a view state,
// so it is not pushed onto the undo stack.
outlineEl.addEventListener('click', (e) => {
  const toggle = e.target.closest('.toggle');
  if (!toggle) return;
  const path = findPath(doc.root, toggle.dataset.toggle);
  if (!path) return;
  const node = path[path.length - 1];
  node.collapsed = !node.collapsed;
  currentId = node.id;
  currentOffset = Infinity;
  render();
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
        markUnsaved();
      }
    }
    currentId = id;
  }
  render(); // refresh the has-note indicator and restore focus to the node
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
/* JSON export / import (Phase 0 stand-in for the server)                 */
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

function exportJson() {
  jsonEl.value = serialise();
  setStatus('exported');
}

function importJson() {
  try {
    const parsed = JSON.parse(jsonEl.value);
    if (!parsed.root || !parsed.rootId) throw new Error('missing root');
    endTextBurst();
    snapshot();
    doc = parsed;
    currentId = doc.rootId;
    currentOffset = 0;
    render();
    setStatus('imported');
  } catch (err) {
    setStatus('invalid JSON');
    console.warn('Import failed:', err);
  }
}

/* ---------------------------------------------------------------------- */
/* Status line                                                            */
/* ---------------------------------------------------------------------- */

function setStatus(text) {
  statusEl.textContent = text;
}
function markUnsaved() {
  setStatus('edited');
}

/* ---------------------------------------------------------------------- */
/* Wire up the toolbar and boot                                           */
/* ---------------------------------------------------------------------- */

document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);
document.getElementById('btn-export').addEventListener('click', exportJson);
document.getElementById('btn-import').addEventListener('click', importJson);
document
  .getElementById('detail-edit')
  .addEventListener('click', () => openNoteDialog(currentId));

render();
