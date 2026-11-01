#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<'EOF'
Usage: ./start.sh [ports|named|api|web]

Start Metadata locally.

  ports  Start the API on :8787 and web app on :5177 (default)
  named  Start the Portless HTTPS apps on *.localhost (Node 24+)
  api    Start only the API
  web    Start only the web app
EOF
}

mode="${1:-ports}"
case "$mode" in
  ports|default)
    npm_script="dev"
    ;;
  named)
    npm_script="dev:named"
    ;;
  api)
    npm_script="dev:api"
    ;;
  web)
    npm_script="dev:web"
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    echo "start.sh: unknown mode: $mode" >&2
    usage >&2
    exit 2
    ;;
esac

if ! command -v node >/dev/null 2>&1; then
  echo "start.sh: Node.js >=20 is required; install Node.js and try again." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "start.sh: npm is required; install npm and try again." >&2
  exit 1
fi

node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( node_major < 20 )); then
  echo "start.sh: Node.js >=20 is required; found $(node --version)." >&2
  exit 1
fi

if [[ "$mode" == "named" && node_major -lt 24 ]]; then
  cat >&2 <<EOF
start.sh: the named Portless mode requires Node.js >=24; found $(node --version).

Use the port-based launcher with this runtime:
  ./start.sh

Or switch to Node.js 24+ and retry:
  nvm install 24
  nvm use 24
  ./start.sh named
EOF
  exit 1
fi

if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  echo "start.sh: dependencies are not installed; run 'npm install' first." >&2
  exit 1
fi

exec npm run "$npm_script"
