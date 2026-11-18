#!/usr/bin/env bash
# Build TaffysCandyReel.exe (Windows x64) — works from Linux, macOS or Windows (Git Bash).
# Needs: Go 1.22+, Node + Playwright (only to render the app icon), Python 3 + Pillow.
set -euo pipefail
cd "$(dirname "$0")/.."            # projects/daily-game/dragon-candy-reel
ROOT=$(pwd)
export GOPROXY=${GOPROXY:-https://proxy.golang.org,direct}
export GOSUMDB=${GOSUMDB:-sum.golang.org}

echo "1/4  Copying game files into the app"
rm -rf app/web && cp -r game app/web

echo "2/4  Rendering the app icon"
mkdir -p build
node tools/render_icon.js game/assets/default/icon.svg build
python3 tools/make_ico.py build app/icon.ico

echo "3/4  Embedding icon + manifest resources"
GOBIN_DIR=$(go env GOBIN); [ -n "$GOBIN_DIR" ] || GOBIN_DIR="$(go env GOPATH)/bin"   # go install uses GOBIN when set
RSRC=$(command -v rsrc || echo "$GOBIN_DIR/rsrc")
[ -x "$RSRC" ] || go install github.com/akavel/rsrc@v0.10.2
"$RSRC" -arch amd64 -manifest app/app.manifest -ico app/icon.ico -o app/rsrc_windows_amd64.syso

echo "4/4  Compiling"
cd app
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H windowsgui" -o "$ROOT/dist/TaffysCandyReel.exe" .
cd "$ROOT"
ls -lh dist/TaffysCandyReel.exe
