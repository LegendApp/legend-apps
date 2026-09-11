#!/usr/bin/env bash
set -euo pipefail
parser_root="$(cd "$(dirname "$0")/.." && pwd)"
vendor_root="$parser_root/vendor/tree-sitter"
# Only write into this dedicated vendor directory. Pinned upstream source;
# no build-time downloads or dependency on a globally installed CLI.
mkdir -p "$vendor_root"
download_root="$(mktemp -d)"
curl -fsSL https://codeload.github.com/tree-sitter/tree-sitter/tar.gz/208c6cac1453315e979f05ab34b6d4f7cd0340be | tar -xz -C "$download_root"
runtime_root="$download_root/tree-sitter-208c6cac1453315e979f05ab34b6d4f7cd0340be"
mkdir -p "$vendor_root/runtime" "$vendor_root/queries"
cp -R "$runtime_root/lib/src" "$runtime_root/lib/include" "$vendor_root/runtime/"
cp "$runtime_root/LICENSE" "$vendor_root/runtime/LICENSE"
node "$parser_root/scripts/vendor-tree-sitter-grammars.ts"
node "$parser_root/scripts/embed-tree-sitter-queries.ts"
node "$parser_root/scripts/compile-tree-sitter.ts" "$download_root/build" --update-symbols
echo "Vendored pinned sources. Download scratch directory: $download_root"
