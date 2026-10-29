@echo off
rem Glint dev: starts the CORS proxy (:8081) and the wasm web app (:8080).
rem Usage: dev.bat        then open http://localhost:8080
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required for the dev proxy.
  exit /b 1
)

echo [glint] starting dev proxy on http://localhost:8081 ...
start "glint-dev-proxy" node dev-proxy\server.cjs

echo [glint] starting web app on http://localhost:8080 (first build takes a while) ...
call gradlew.bat :webApp:wasmJsBrowserDevelopmentRun
