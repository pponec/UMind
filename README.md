# UMind
UMind — a minimalist, self-hosted mind-mapping app. Servlet-based Java backend, ujo-web HTML5 frontend, plain-JSON storage, no cloud lock-in.

## Running the prototype

The Phase 0 prototype lives in `prototype/`. Serve it over http so that
auto-save (localStorage) works reliably.

From the repository root:

```
python3 -m http.server -d prototype 8000
```

(or from inside `prototype/`: `python3 -m http.server 8000`)

Then open http://localhost:8000/

Opening `prototype/index.html` directly via `file://` also works, but
localStorage auto-save may be disabled by the browser; use the **Save** / **Open**
buttons to keep a `umind.json` file instead.
