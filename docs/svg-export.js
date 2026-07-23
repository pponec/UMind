/*
 * UMind — SVG export (Phase 2 add-on, self-contained).
 *
 * Turns the document into a two-sided mind-map drawing and opens it in a new
 * browser tab. Layout rules (see the design notes):
 *
 *   1. Root is centred. Up to 3 branches all go right; with more, the first
 *      floor(N/2) go right and the rest go left, both in source order top to
 *      bottom (the left side is mirrored, not rotated).
 *   2. Nodes are one line with a measured width; branches are always drawn
 *      expanded (`collapsed` is view state and is ignored here).
 *   3. Connectors are cubic Béziers; the palette is always light so the file
 *      prints and shares well regardless of the app theme.
 *   4. A node's description is drawn as a UML-style note bubble whose *space is
 *      reserved during layout* — that is what guarantees bubbles never overlap
 *      anything, instead of trying to place them afterwards:
 *        - leaf   -> the outer gutter, vertically aligned with the node,
 *                    its slot grown to the bubble height;
 *        - parent -> a lane reserved right below its whole subtree, centred
 *                    under the node, reached by a short vertical leader that
 *                    therefore crosses no child;
 *        - root   -> the free strip below the root box (branch columns start
 *                    far to the left and right of it).
 *
 * Note bodies are real Markdown: they reuse the app's renderMarkdown() inside
 * an SVG <foreignObject>, and the browser both lays them out and measures them,
 * so the reserved height is exact. Trade-off: <foreignObject> renders in
 * browsers but not in Inkscape/librsvg or when rasterising to PNG.
 *
 * Public API (globals, matching markdown.js style):
 *   documentToSvg(doc)          -> SVG source string
 *   exportSvg(doc, fileName)    -> opens it in a new tab (downloads if blocked)
 */
'use strict';

(function (global) {

  /* -------------------------------------------------------------------- */
  /* Geometry and style constants                                          */
  /* -------------------------------------------------------------------- */

  const FONT_STACK =
    "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  const PAD = 44;            // margin around the whole drawing
  const SLOT = 46;           // vertical space one plain leaf consumes
  const COL_MIN = [300, 330];// smallest gap root->depth 1, depth 1->2 (last repeats)
  const LINK_MIN = 120;      // shortest connector: columns grow to keep this
  const BOX_H = 34;          // node box height
  const ROOT_H = 42;         // root box height
  const MAX_BOX_W = 460;     // wider labels are truncated with an ellipsis
  const RADIUS = 8;

  const NOTE_W = 246;        // note bubble width
  const NOTE_MIN_H = 44;
  const NOTE_MAX_H = 300;    // taller notes are clipped (see .umnote overflow)
  const LEAD = 30;           // leader-line length from node to bubble
  const LANE_GAP = 16;       // padding around a parent's reserved note lane
  const DOGEAR = 14;         // folded-corner size (always the top-right corner)

  // Light palette — deliberately independent of the app theme.
  const C = {
    bg: '#ffffff',
    rootFill: '#2563eb', rootText: '#ffffff',
    branchFill: '#eef4ff', branchStroke: '#2563eb',
    leafFill: '#ffffff', leafStroke: '#c7d2e5',
    text: '#1f2328',
    link: '#9db3d6',
    noteFill: '#fffbea', noteStroke: '#e0b400', noteFlap: '#f4e7b0',
    leader: '#d9a400',
  };

  const NOTE_CSS = `
.umnote { box-sizing: border-box; width: 100%; padding: 8px 12px 10px;
  font: 400 11.5px/1.45 ${FONT_STACK}; color: #3d3a2f; overflow: hidden; }
.umnote .h { display: block; font: 700 9.5px/1.4 ${FONT_STACK};
  letter-spacing: .09em; color: #a07c00; margin: 0 0 4px; }
.umnote p, .umnote ul, .umnote ol, .umnote pre, .umnote blockquote,
.umnote table { margin: 0 0 5px; }
.umnote > :last-child { margin-bottom: 0; }
.umnote h1, .umnote h2, .umnote h3, .umnote h4, .umnote h5, .umnote h6 {
  font-size: 12px; margin: 0 0 4px; }
.umnote ul, .umnote ol { padding-left: 16px; }
.umnote li { margin: 0 0 2px; }
.umnote code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px; background: #f3ecd0; border-radius: 3px; padding: 0 3px; }
.umnote pre { background: #f3ecd0; border-radius: 4px; padding: 5px 6px;
  overflow: hidden; }
.umnote pre code { background: none; padding: 0; }
.umnote blockquote { padding-left: 8px; border-left: 2px solid #e0cf8a; }
.umnote a { color: #2563eb; }
.umnote img { max-width: 100%; }
.umnote table { border-collapse: collapse; font-size: 10.5px; }
.umnote th, .umnote td { border: 1px solid #e0cf8a; padding: 1px 4px; }
`;

  /* -------------------------------------------------------------------- */
  /* Text measuring                                                        */
  /* -------------------------------------------------------------------- */

  let measureCtx = null;

  /** Lazily create the 2D context used to measure label widths. */
  function ctx() {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    return measureCtx;
  }

  /** Font of a node label at the given depth (0 = root). */
  function boxFont(depth) {
    switch (depth) {
      case 0: return { weight: 700, size: 17, padX: 18 };
      case 1: return { weight: 600, size: 15, padX: 14 };
      default: return { weight: 400, size: 14, padX: 12 };
    }
  }

  /** Measure one line of text in the given font. */
  function textWidth(text, f) {
    const c = ctx();
    c.font = `${f.weight} ${f.size}px ${FONT_STACK}`;
    return c.measureText(text).width;
  }

  /** Fit a label into at most MAX_BOX_W, truncating with an ellipsis.
   *  Returns the (possibly shortened) label and the resulting box width. */
  function fitLabel(text, f) {
    const label = (text || '').trim() || ' ';
    const max = MAX_BOX_W - 2 * f.padX;
    if (textWidth(label, f) <= max) {
      return { label: label, w: Math.round(textWidth(label, f) + 2 * f.padX) };
    }
    let cut = label;
    while (cut.length > 1 && textWidth(cut + '…', f) > max) cut = cut.slice(0, -1);
    return { label: cut + '…', w: MAX_BOX_W };
  }

  /* -------------------------------------------------------------------- */
  /* Note rendering and measuring                                          */
  /* -------------------------------------------------------------------- */

  /** Absolute URL for an asset referenced from a note, so the exported file
   *  (served from a blob: URL) still resolves images and links. */
  function absolute(url) {
    try {
      return new URL(url, document.baseURI).href;
    } catch (e) {
      return url;
    }
  }

  /**
   * Render one note to XHTML and measure the height it needs at NOTE_W.
   * The markup is produced with XMLSerializer (not innerHTML) because the
   * exported file is parsed as XML, where `<br>` or `<img>` would be fatal.
   */
  function buildNote(markdown, host) {
    const box = document.createElement('div');
    box.className = 'umnote';
    const head = document.createElement('span');
    head.className = 'h';
    head.textContent = '🗒 NOTE';
    box.appendChild(head);
    const body = document.createElement('div');
    global.renderMarkdownInto(body, markdown);
    body.querySelectorAll('img[src]').forEach((el) => {
      el.setAttribute('src', absolute(el.getAttribute('src')));
    });
    body.querySelectorAll('a[href]').forEach((el) => {
      el.setAttribute('href', absolute(el.getAttribute('href')));
    });
    while (body.firstChild) box.appendChild(body.firstChild);

    host.appendChild(box);
    const h = Math.min(NOTE_MAX_H, Math.max(NOTE_MIN_H, Math.ceil(box.offsetHeight)));
    const xml = new XMLSerializer().serializeToString(box);
    host.removeChild(box);
    return { h: h, xml: xml };
  }

  /** Measure every note of the layout tree, replacing each node's `note`
   *  Markdown with the measured { h, xml } (nodes without one keep null).
   *  The hidden host carries NOTE_CSS so measuring matches the exported file. */
  function measureNotes(root) {
    const host = document.createElement('div');
    host.style.cssText =
      'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;' +
      'width:' + NOTE_W + 'px';
    const style = document.createElement('style');
    style.textContent = NOTE_CSS;
    host.appendChild(style);
    document.body.appendChild(host);

    const walk = (node) => {
      if (node.note) node.note = buildNote(node.note, host);
      node.children.forEach(walk);
    };
    try {
      walk(root);
    } finally {
      document.body.removeChild(host);
    }
  }

  /* -------------------------------------------------------------------- */
  /* Layout                                                                */
  /* -------------------------------------------------------------------- */

  /** Copy the document tree into a private layout tree. Layout writes plenty of
   *  scratch fields (x, y, width, side…) and must never touch the live document,
   *  whose nodes end up in undo snapshots and in localStorage. */
  function layoutTree(node) {
    return {
      text: (node.text || ''),
      note: (node.note || '').trim() || null,
      children: (node.children || []).map(layoutTree),
    };
  }

  /** Split the root's branches: up to 3 all go right, otherwise the first
   *  floor(N/2) go right and the remainder left, both kept in source order. */
  function splitBranches(children) {
    const n = children.length;
    if (n <= 3) return { right: children.slice(), left: [] };
    const r = Math.floor(n / 2);
    return { right: children.slice(0, r), left: children.slice(r) };
  }

  /**
   * Assign y positions to one side by packing leaves into vertical slots; a
   * parent sits at the mean of its children. Slots are grown for leaf notes,
   * and a parent with a note reserves a lane below its whole subtree.
   * Returns the total height consumed.
   */
  function layoutSide(branches, side, widths) {
    let y = 0;
    const slot = (h) => { const centre = y + h / 2; y += h; return centre; };

    const walk = (node, depth) => {
      node._side = side;
      node._depth = depth;
      const fit = fitLabel(node.text, boxFont(depth));
      node._label = fit.label;
      node._w = fit.w;
      widths[depth] = Math.max(widths[depth] || 0, fit.w);
      const kids = node.children;
      if (!kids.length) {
        node._y = slot(node.note ? Math.max(SLOT, node.note.h + 14) : SLOT);
      } else {
        kids.forEach((k) => walk(k, depth + 1));
        node._y = (kids[0]._y + kids[kids.length - 1]._y) / 2;
        if (node.note) node._lane = slot(node.note.h + LANE_GAP);
      }
    };

    branches.forEach((b) => walk(b, 1));
    return y;
  }

  /** Column offsets per depth. Each column is pushed out far enough that even
   *  the widest box of the previous depth still leaves a readable connector,
   *  so wide labels stretch the drawing instead of colliding. */
  function columns(widths, depth) {
    const colX = [0];
    for (let d = 1; d <= depth; d++) {
      const prev = d === 1 ? (widths[0] || 0) / 2 : (widths[d - 1] || 0);
      const min = COL_MIN[Math.min(d - 1, COL_MIN.length - 1)];
      colX.push(colX[d - 1] + Math.max(min, prev + LINK_MIN));
    }
    return colX;
  }

  /** Shift a laid-out subtree vertically (used to centre the two sides). */
  function shiftY(node, dy) {
    node._y += dy;
    if (node._lane != null) node._lane += dy;
    node.children.forEach((k) => shiftY(k, dy));
  }

  /** Assign x positions: every depth is its own column, mirrored on the left. */
  function assignX(node, colX) {
    const d = node._depth;
    node._x = node._side > 0 ? colX[d] : -colX[d] - node._w;
    node._cx = node._x + node._w / 2;
    node.children.forEach((k) => assignX(k, colX));
  }

  /** Rectangle of a node's note bubble, per placement rules 4a–4c. */
  function noteRect(node) {
    const h = node.note.h;
    if (node._depth === 0) {                       // root: free strip below it
      return { x: -NOTE_W / 2, y: node._y + ROOT_H / 2 + LEAD, w: NOTE_W, h: h, kind: 'root' };
    }
    if (!node.children.length) {                   // leaf: outer gutter
      const x = node._side > 0
        ? node._x + node._w + LEAD
        : node._x - LEAD - NOTE_W;
      return { x: x, y: node._y - h / 2, w: NOTE_W, h: h, kind: 'leaf' };
    }
    return {                                       // parent: reserved lane below
      x: node._cx - NOTE_W / 2, y: node._lane - h / 2, w: NOTE_W, h: h, kind: 'parent',
    };
  }

  /** Lay the (already measured) layout tree out and collect flat draw lists. */
  function layout(root) {
    const { right, left } = splitBranches(root.children);
    const widths = [];
    const hRight = layoutSide(right, 1, widths);
    const hLeft = layoutSide(left, -1, widths);
    const height = Math.max(hRight, hLeft, SLOT);
    right.forEach((b) => shiftY(b, (height - hRight) / 2));
    left.forEach((b) => shiftY(b, (height - hLeft) / 2));

    root._depth = 0;
    root._side = 1;
    const fit = fitLabel(root.text, boxFont(0));
    root._label = fit.label;
    root._w = fit.w;
    root._x = -root._w / 2;
    root._cx = 0;
    root._y = height / 2;
    widths[0] = root._w;

    const colX = columns(widths, widths.length - 1);
    right.forEach((b) => assignX(b, colX));
    left.forEach((b) => assignX(b, colX));

    const boxes = [];
    const links = [];
    const bubbles = [];
    const collect = (node) => {
      boxes.push(node);
      if (node.note) bubbles.push({ node: node, note: node.note, rect: noteRect(node) });
      node.children.forEach((k) => { links.push([node, k]); collect(k); });
    };
    collect(root);
    return { boxes: boxes, links: links, bubbles: bubbles };
  }

  /* -------------------------------------------------------------------- */
  /* SVG emitting                                                          */
  /* -------------------------------------------------------------------- */

  /** Escape a string for use as XML text or an attribute value. */
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Round to 1 decimal — keeps the file small and diff-friendly. */
  function r(n) {
    return Math.round(n * 10) / 10;
  }

  /** Half-height of a node's box. */
  function halfH(node) {
    return (node._depth === 0 ? ROOT_H : BOX_H) / 2;
  }

  /** Cubic Bézier from a parent's side edge to a child's facing edge. */
  function linkPath(parent, child) {
    const right = child._side > 0;
    const x1 = right ? parent._x + parent._w : parent._x;
    const x2 = right ? child._x : child._x + child._w;
    const y1 = parent._y;
    const y2 = child._y;
    const dx = (x2 - x1) / 2;
    return `M${r(x1)},${r(y1)} C${r(x1 + dx)},${r(y1)} ${r(x2 - dx)},${r(y2)} ${r(x2)},${r(y2)}`;
  }

  /** Dashed leader from a node to its bubble: horizontal for a leaf (outer
   *  gutter), a short vertical drop for a parent or the root. */
  function leaderPath(node, rect) {
    if (rect.kind === 'leaf') {
      const right = node._side > 0;
      const x1 = right ? node._x + node._w : node._x;
      const x2 = right ? rect.x : rect.x + rect.w;
      return `M${r(x1)},${r(node._y)} L${r(x2)},${r(rect.y + rect.h / 2)}`;
    }
    return `M${r(node._cx)},${r(node._y + halfH(node))} L${r(node._cx)},${r(rect.y)}`;
  }

  /** Node box: rounded rect plus its single-line, vertically centred label. */
  function boxSvg(node) {
    const isRoot = node._depth === 0;
    const h = isRoot ? ROOT_H : BOX_H;
    const f = boxFont(node._depth);
    const fill = isRoot ? C.rootFill : node._depth === 1 ? C.branchFill : C.leafFill;
    const stroke = isRoot ? C.rootFill : node._depth === 1 ? C.branchStroke : C.leafStroke;
    const colour = isRoot ? C.rootText : C.text;
    return (
      `<g><rect x="${r(node._x)}" y="${r(node._y - h / 2)}" width="${r(node._w)}" ` +
      `height="${h}" rx="${isRoot ? RADIUS + 2 : RADIUS}" fill="${fill}" stroke="${stroke}" ` +
      `stroke-width="${node._depth <= 1 ? 1.5 : 1}"/>` +
      `<text x="${r(node._cx)}" y="${r(node._y)}" text-anchor="middle" ` +
      `dominant-baseline="central" fill="${colour}" ` +
      `font-family="${esc(FONT_STACK)}" font-size="${f.size}" font-weight="${f.weight}">` +
      `${esc(node._label)}</text></g>`
    );
  }

  /** UML-style note bubble: paper with a folded top-right corner, the folded
   *  flap, and the Markdown body in a <foreignObject>. */
  function bubbleSvg(b) {
    const { x, y, w, h } = b.rect;
    const paper =
      `M${r(x)},${r(y)} H${r(x + w - DOGEAR)} L${r(x + w)},${r(y + DOGEAR)} ` +
      `V${r(y + h)} H${r(x)} Z`;
    const flap = `M${r(x + w - DOGEAR)},${r(y)} V${r(y + DOGEAR)} H${r(x + w)} Z`;
    return (
      `<g><path d="${paper}" fill="${C.noteFill}" stroke="${C.noteStroke}" stroke-width="1"/>` +
      `<path d="${flap}" fill="${C.noteFlap}" stroke="${C.noteStroke}" stroke-width="1"/>` +
      `<foreignObject x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}">` +
      `${b.note.xml}</foreignObject></g>`
    );
  }

  /** Build the whole SVG document source for the given map. */
  function documentToSvg(doc) {
    const root = layoutTree(doc.root);
    measureNotes(root);
    const scene = layout(root);

    // Bounding box over every drawn shape.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const grow = (x1, y1, x2, y2) => {
      minX = Math.min(minX, x1); maxX = Math.max(maxX, x2);
      minY = Math.min(minY, y1); maxY = Math.max(maxY, y2);
    };
    scene.boxes.forEach((n) => {
      grow(n._x, n._y - halfH(n), n._x + n._w, n._y + halfH(n));
    });
    scene.bubbles.forEach((b) => {
      grow(b.rect.x, b.rect.y, b.rect.x + b.rect.w, b.rect.y + b.rect.h);
    });

    const width = Math.ceil(maxX - minX + 2 * PAD);
    const height = Math.ceil(maxY - minY + 2 * PAD);
    const dx = PAD - minX;
    const dy = PAD - minY;

    const parts = [];
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
    parts.push(`<title>${esc((doc.root.text || 'UMind map').trim())}</title>`);
    parts.push(`<style>${NOTE_CSS}</style>`);
    parts.push(`<rect width="${width}" height="${height}" fill="${C.bg}"/>`);
    parts.push(`<g transform="translate(${r(dx)},${r(dy)})">`);

    parts.push(`<g fill="none" stroke="${C.link}" stroke-width="2" stroke-linecap="round">`);
    scene.links.forEach(([p, c]) => parts.push(`<path d="${linkPath(p, c)}"/>`));
    parts.push('</g>');

    parts.push(
      `<g fill="none" stroke="${C.leader}" stroke-width="1.4" stroke-dasharray="4 4">`);
    scene.bubbles.forEach((b) => parts.push(`<path d="${leaderPath(b.node, b.rect)}"/>`));
    parts.push('</g>');

    scene.bubbles.forEach((b) => parts.push(bubbleSvg(b)));
    scene.boxes.forEach((n) => parts.push(boxSvg(n)));

    parts.push('</g></svg>');
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + parts.join('\n') + '\n';
  }

  /* -------------------------------------------------------------------- */
  /* Export action                                                         */
  /* -------------------------------------------------------------------- */

  /**
   * Export the map and show it in a new tab. window.open must be called from
   * the click handler's own task or the popup blocker kills it, so the SVG is
   * built first and opened synchronously; when the popup is blocked anyway
   * (sandboxed iframe, strict settings) we fall back to a download.
   * Returns true when the tab opened.
   */
  function exportSvg(doc, fileName) {
    const svg = documentToSvg(doc);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const tab = global.open(url, '_blank');
    if (!tab) {
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'mindmap.svg';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    // Keep the blob alive long enough for the new tab to load it.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return Boolean(tab);
  }

  global.documentToSvg = documentToSvg;
  global.exportSvg = exportSvg;

})(window);
