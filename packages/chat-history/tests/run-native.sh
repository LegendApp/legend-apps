#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BUILD_DIR="$ROOT_DIR/packages/chat-history/tests/.build"
mkdir -p "$BUILD_DIR"

clang++ \
  -std=c++20 \
  -Wall \
  -Wextra \
  -Werror \
  -I"$ROOT_DIR/packages/markdown-parser/tests/stubs" \
  -I"$ROOT_DIR/packages/chat-history/nitrogen/generated/shared/c++" \
  "$ROOT_DIR/packages/chat-history/tests/chat_history_test.cpp" \
  "$ROOT_DIR/packages/chat-history/cpp/ChatJson.cpp" \
  "$ROOT_DIR/packages/chat-history/cpp/ChatCatalog.cpp" \
  "$ROOT_DIR/packages/chat-history/cpp/ChatTranscriptParser.cpp" \
  "$ROOT_DIR/packages/chat-history/cpp/ChatDocumentRegistry.cpp" \
  "$ROOT_DIR/packages/chat-history/cpp/HybridChatDocument.cpp" \
  "$ROOT_DIR/packages/chat-history/nitrogen/generated/shared/c++/HybridChatDocumentSpec.cpp" \
  -o "$BUILD_DIR/chat_history_test"

"$BUILD_DIR/chat_history_test" "$ROOT_DIR/packages/chat-history/tests/fixtures"
