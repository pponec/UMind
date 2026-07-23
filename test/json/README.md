# Test maps

Hand-made UMind documents for checking the outliner and — mainly — the
**Show graph** picture (`docs/svg-export.js`). They are variations on the
welcome map from `docs/welcome.js`, each shaped around one thing that is easy
to get wrong.

Load one with the toolbar's **Open…** button. They are ordinary project files,
so anything you do to them is auto-saved under their own name; use **New** to
get back to a blank project.

| File | What it is for |
|---|---|
| `01-note-sizes.json` | The same branch shape five times over with notes from none to very tall. A tall bubble sits in the outer gutter, so it must **not** push the branches below it down: check that the last branch does not sink. The last leaf of the *very tall note* branch carries a bubble around 425 px high — well past the 300 px ceiling notes used to be truncated at, so it is the regression test for "a note is never cut off". |
| `02-deep-nesting.json` | The welcome map with **two extra levels** grafted under the keyboard branch (nodes down to level 5). Columns are generated per depth — check that deep levels line up and the connectors stay readable. |
| `03-tree-shapes.json` | Branches of deliberately different shape: a fan of twelve leaves, a single-child chain, a lopsided branch, a **collapsed** branch (the picture ignores collapse), a label long enough to be truncated with an ellipsis, and a childless branch. Check that short branches rise into the space beside the tall fan. |
| `04-notes-everywhere.json` | A description on **every** node, root and branches included — the worst case for placing bubbles, and the one that exercises the fallback for a bubble much wider than its node. |
| `05-markdown-notes.json` | Notes full of Markdown: headings, ordered lists, block quotes, a table, fenced code, links, and characters that must be escaped (`<script>`, `&`, quotes, diacritics, emoji). The bubbles are real HTML inside the SVG, so this is where escaping bugs would show. The *Code wider than the bubble* branch is the one to watch: **code lines, URLs, long identifiers and a five-column table, all wider than the bubble**. A `pre` block does not wrap on its own, so these used to run out of the note and be cut off by the `<foreignObject>`; every line must now wrap and keep its indentation. |

## What to look for in the picture

- no box or bubble overlapping another one;
- no connector or dashed leader line running underneath a box or a bubble;
- every note next to the node it belongs to;
- the sheet no taller than the content needs.

Note that `<foreignObject>` — which carries the Markdown — renders in browsers
but **not** in Inkscape, librsvg, or when converting the file to PNG. Open the
exported `.svg` in a browser.
