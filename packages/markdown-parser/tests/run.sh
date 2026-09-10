#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BUILD_DIR="$ROOT_DIR/packages/markdown-parser/tests/.build"
mkdir -p "$BUILD_DIR"

COMPILER_FLAGS=(-std=c++20)
if [[ "${1:-}" == "--sanitize-thread" ]]; then
  COMPILER_FLAGS+=(-g -O1 -fsanitize=thread)
elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--sanitize-thread]" >&2
  exit 1
fi

clang++ \
  "${COMPILER_FLAGS[@]}" \
  -Wall \
  -Wextra \
  -Werror \
  -I"$ROOT_DIR/packages/markdown-parser/tests/stubs" \
  -I"$ROOT_DIR/packages/markdown-parser/nitrogen/generated/shared/c++" \
  -I"$ROOT_DIR/packages/native-text-source/cpp" \
  "$ROOT_DIR/packages/markdown-parser/tests/markdown_document_transactions_test.cpp" \
  "$ROOT_DIR/packages/markdown-parser/cpp/MarkdownBlockParser.cpp" \
  "$ROOT_DIR/packages/markdown-parser/cpp/HybridMarkdownDocument.cpp" \
  "$ROOT_DIR/packages/markdown-parser/cpp/HybridMarkdownParser.cpp" \
  "$ROOT_DIR/packages/markdown-parser/nitrogen/generated/shared/c++/HybridMarkdownDocumentSpec.cpp" \
  "$ROOT_DIR/packages/markdown-parser/nitrogen/generated/shared/c++/HybridMarkdownParserSpec.cpp" \
  -o "$BUILD_DIR/markdown_document_transactions_test"

"$BUILD_DIR/markdown_document_transactions_test"
