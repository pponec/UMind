# Shared maps (`data/`)

Maps in this folder are **shared, read-only** UMind maps that anyone can open by
URL. They are plain static files — GitHub Pages serves them as-is, no server code.

## Publishing a map

1. In the app, build the map and use **Save As** to export a `.json`.
2. Drop the exported file here, e.g. `data/onboarding.json`.
3. Commit and push. It is now live.

## Opening a shared map

Append the **file name (with `.json`)** to the app URL:

```
https://pponec.github.io/UMind/?onboarding.json
```

- A query **with** `.json` → a shared file from this folder, shown as a **picture**
  (graph view), read-only.
- A query **without** `.json` (e.g. `?onboarding`) → a personal project from the
  visitor's own browser storage, opened in the **editor**.

## Read-only, with a one-click fork

A shared map is never auto-saved. The reader can press **Edit map** to fork a
personal copy into their browser (`?onboarding`), which is where editing and
auto-save begin — the shared file itself is never modified.

## Naming rules (security)

Only a **bare file name** is accepted after `?`: letters, digits, `.`, `_`, `-`,
ending in `.json`. No path segments (`/`) and no `..`, so a map can only ever be
read from this one folder — never from anywhere else on the server.
