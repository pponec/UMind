#!/usr/bin/env python3
"""Run the UMind Phase 0 prototype over http (so localStorage auto-save works).

Usage:
    python3 run.py            # serve on http://localhost:8000/
    python3 run.py 9000       # serve on a custom port
    ./run.py                  # after: chmod +x run.py

Serves the prototype/ directory next to this script (works from any working
directory) and opens the page in your default browser. Stop with Ctrl+C.
"""

import functools
import http.server
import sys
import webbrowser
from pathlib import Path

DEFAULT_PORT = 8000


def main() -> int:
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"Invalid port: {sys.argv[1]!r}", file=sys.stderr)
            return 2

    root = Path(__file__).resolve().parent / "prototype"
    if not (root / "index.html").is_file():
        print(f"prototype/index.html not found under {root}", file=sys.stderr)
        return 1

    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=str(root)
    )
    url = f"http://localhost:{port}/"

    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"UMind prototype: {url}  (serving {root})")
        print("Press Ctrl+C to stop.")
        try:
            webbrowser.open(url)
        except Exception:
            pass  # headless environment; the URL above still works
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
