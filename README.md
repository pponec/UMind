# UMind
UMind — a minimalist, self-hosted mind-mapping app. Servlet-based Java backend, ujo-web HTML5 frontend, plain-JSON storage, no cloud lock-in.

**▶ Try it live:** https://pponec.github.io/UMind/?welcome — always opens the
welcome/instructions map, and runs entirely in your browser (auto-saved to
localStorage, no account needed). The `?welcome` link is non-destructive: the
welcome map is a preview only, your saved maps are left untouched, and a plain
reload returns to your own work.

## Quick start

```
python3 run.py       # then open http://localhost:8000/
```

No Python? `java Run.java` does the same (Java 17+, no build step). Details below.

## Requirements

Two independent things describe the frontend code:

- **Approach — "vanilla" JavaScript.** This is *not* a version; it means plain
  JS with **no framework and no library** (no React/Vue/jQuery), and here also
  **no build step, no bundler, no polyfills, and no ES modules** — just classic
  `<script src="…">` tags.
- **Language version — ECMAScript 2017 (`ES2017`, a.k.a. `ES8`).** This is the
  edition the code targets. The newest syntax used is `async/await` (ES2017);
  there is no optional chaining, nullish coalescing, or other ES2020+ syntax.
  (ECMAScript editions, for reference: ES6 = ES2015, ES8 = ES2017, ES11 =
  ES2020.)

So the accurate one-line label is **"vanilla JavaScript, ECMAScript 2017"** —
the first says *how* it is written, the second says *which language version*.

In practice the app is gated by two runtime features rather than by JS syntax:
the CSS `:has()` selector (mobile detail card) and Pointer Events. So any
**evergreen browser from late 2023** runs it — **Chrome/Edge 105+, Safari
15.4+, Firefox 121+**. The optional disk **Save/Open** to a real file uses the
File System Access API (Chromium only) and degrades gracefully to a
download + file picker elsewhere.

## Running the app

The app is a static frontend (`index.html`, `app.js`, `markdown.js`,
`style.css`) that lives in **`docs/`**, so GitHub Pages publishes it as-is with
the **Deploy from a branch → `/docs`** source (Settings → Pages). Serve it over
http so that auto-save (localStorage) works reliably.

From the repository root, use one of the bundled launchers (they serve `docs/`
and open the browser for you; both take an optional port, default `8000`):

```
python3 run.py           # or: python3 run.py 9000
java Run.java            # or: java Run.java 9000  (Java 17+, no build step)
```

A plain static server works too:

```
python3 -m http.server -d docs 8000
```

Then open http://localhost:8000/

Opening `docs/index.html` directly via `file://` also works, but localStorage
auto-save may be disabled by the browser; use the **Save** / **Open** buttons to
keep a `umind.json` file instead.

## Images in node descriptions

Node descriptions are Markdown, so they can embed images with
`![alt](src)`. How the `src` resolves is governed by the browser's security
model, so a few rules apply — **especially** when the app is hosted on GitHub
Pages or any `https`/`http` origin:

| `src` value | Result |
|---|---|
| `https://example.com/pic.png` | Loads from that server. Works anywhere. |
| `images/pic.png` (relative) | Resolved against the **page origin** (e.g. `https://…github.io/UMind/images/pic.png`), so the image must be deployed alongside the app — never read from the visitor's disk. |
| `file:///home/me/pic.png` | **Blocked.** Browsers refuse to load `file://` from a page served over `http`/`https`. |
| `data:image/png;base64,…` | Embedded inline; works everywhere. Note it is stored in the document JSON / localStorage, so keep such images small. |

**You cannot reference an image from the local filesystem** (`file://`) from a
hosted page — that includes GitHub Pages. To use a local image you must **run a
local server** and reference the file by a relative path served from `docs/`
(or a subfolder). For example, drop the file in `docs/images/logo.png`, start a
launcher above, and in a node description write:

```markdown
Project logo:

![UMind logo](images/logo.png)
```

The browser then requests `http://localhost:8000/images/logo.png`, which the
launcher serves from `docs/images/`. The same relative reference keeps working
after deployment, provided `docs/images/logo.png` is committed and published
with the app.
