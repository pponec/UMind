# UMind
UMind — a minimalist, self-hosted mind-mapping app. Servlet-based Java backend, ujo-web HTML5 frontend, plain-JSON storage, no cloud lock-in.

## Running the prototype

The Phase 0 prototype lives in `prototype/`. Serve it over http so that
auto-save (localStorage) works reliably.

From the repository root, use one of the bundled launchers (they serve
`prototype/` and open the browser for you; both take an optional port, default
`8000`):

```
python3 run.py           # or: python3 run.py 9000
java Run.java            # or: java Run.java 9000  (Java 17+, no build step)
```

A plain static server works too:

```
python3 -m http.server -d prototype 8000
```

Then open http://localhost:8000/

Opening `prototype/index.html` directly via `file://` also works, but
localStorage auto-save may be disabled by the browser; use the **Save** / **Open**
buttons to keep a `umind.json` file instead.

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
local server** and reference the file by a relative path served from
`prototype/` (or a subfolder). For example, drop the file in
`prototype/images/logo.png`, start a launcher above, and in a node description
write:

```markdown
Project logo:

![UMind logo](images/logo.png)
```

The browser then requests `http://localhost:8000/images/logo.png`, which the
launcher serves from `prototype/images/`. The same relative reference keeps
working after deployment, provided `images/logo.png` is committed and published
with the app.
