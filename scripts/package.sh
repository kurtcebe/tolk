#!/bin/sh
# Build a clean zip of the extension for the Chrome Web Store.
#
#   npm run package
#
# Recompiles from scratch so no stale files from deleted sources ship,
# then zips extension/ with the project licence at the root. The code
# is not minified, so reviewers can read it.
set -eu

cd "$(dirname "$0")/.."

rm -rf extension/js
npx tsc

version=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("extension/manifest.json", "utf8")).version)')
out="dist/tolk-$version.zip"

mkdir -p dist
rm -f "$out"

(cd extension && zip -r -X -q "../$out" . -x '*.DS_Store' -x '*.map' -x '*.tsbuildinfo')
zip -X -q "$out" LICENSE

echo "Wrote $out"
unzip -l "$out" | tail -1
