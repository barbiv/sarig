#!/bin/bash
set -e
cd "$(dirname "$0")/.."
V=$(date +%Y%m%d%H%M)
APPV=$(cat VERSION)
npx --yes esbuild@0.24.0 src/tools/bookmarklet.js --minify --log-level=warning > /tmp/sarig-bm.js
node -e "const s=require('fs').readFileSync('/tmp/sarig-bm.js','utf8').trim();require('fs').writeFileSync('src/bookmarklet_url.js','export const BOOKMARKLET = '+JSON.stringify('javascript:'+encodeURIComponent(s))+';\\n');"
npx --yes esbuild@0.24.0 src/main.js --bundle --minify --format=iife --target=safari15 --define:APP_VERSION="\"$APPV\"" --outfile=docs/app.js --log-level=warning
npx --yes esbuild@0.24.0 src/app.css --minify --outfile=docs/app.css --log-level=warning
sed "s/__V__/$V/g" src/index.html > docs/index.html
DV=$(md5sum docs/data/index.json | cut -c1-8)
sed "s/__V__/$V/g; s/__DV__/$DV/g" src/sw.js > docs/sw.js
echo "built $V"
