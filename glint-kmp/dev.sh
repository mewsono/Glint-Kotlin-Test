#!/usr/bin/env sh
# Glint dev: starts the CORS proxy (:8081) and the wasm web app (:8080).
# Usage: ./dev.sh        then open http://localhost:8080
set -e
cd "$(dirname "$0")"

command -v node >/dev/null 2>&1 || { echo "Node.js is required for the dev proxy."; exit 1; }

echo "[glint] starting dev proxy on http://localhost:8081 ..."
node dev-proxy/server.cjs &
PROXY_PID=$!
trap 'kill $PROXY_PID 2>/dev/null || true' EXIT INT TERM

echo "[glint] starting web app on http://localhost:8080 (first build takes a while) ..."
./gradlew :webApp:wasmJsBrowserDevelopmentRun
