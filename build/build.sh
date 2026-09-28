#!/bin/bash
set -e
cd "$(dirname "$0")/.."
V=$(date +%Y%m%d%H%M)
npx --yes esbuild@0.24.0 src/main.js --bundle --minify --format=iife --target=safari15 --outfile=docs/app.js --log-level=warning
npx --yes esbuild@0.24.0 src/app.css --minify --outfile=docs/app.css --log-level=warning
sed "s/__V__/$V/g" src/index.html > docs/index.html
sed "s/__V__/$V/g" src/sw.js > docs/sw.js
echo "built $V"
