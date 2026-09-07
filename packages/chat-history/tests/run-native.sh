#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BUILD_DIR="$ROOT_DIR/packages/chat-history/tests/.build"
mkdir -p "$BUILD_DIR"

clang++ \
  -std=c++20 \
  -O2 \
  -fobjc-arc \
  -framework Foundation \
  -framework ImageIO \
  -Wall \
  -Wextra \
  -Werror \
  -I"$ROOT_DIR/packages/markdown-parser/tests/stubs" \
  -I"$ROOT_DIR/packages/chat-history/nitrogen/generated/shared/c++" \
  -I"$ROOT_DIR/packages/native-text-source/cpp" \
  "$ROOT_DIR/packages/chat-history/tests/chat_history_test.cpp" \
  "$ROOT_DIR/packages/chat-history/tests/chat_parser_schema_test.cpp" \
  "$ROOT_DIR/packages/chat-history/cpp/ChatJson.cpp" \
  "$ROOT_DIR/packages/chat-history/cpp/ChatCatalog.cpp" \
  "$ROOT_DIR/packages/chat-history/cpp/ChatTime.cpp" \
  "$ROOT_DIR/packages/chat-history/cpp/ChatTranscriptParser.cpp" \
  "$ROOT_DIR/packages/chat-history/cpp/ChatStartupLoad.cpp" \
  "$ROOT_DIR/packages/chat-history/cpp/ChatImageDimensions.mm" \
  "$ROOT_DIR/packages/chat-history/cpp/ChatDocumentRegistry.cpp" \
  "$ROOT_DIR/packages/chat-history/cpp/HybridChatDocument.cpp" \
  "$ROOT_DIR/packages/chat-history/cpp/HybridChatHistory.cpp" \
  "$ROOT_DIR/packages/chat-history/nitrogen/generated/shared/c++/HybridChatHistorySpec.cpp" \
  "$ROOT_DIR/packages/chat-history/nitrogen/generated/shared/c++/HybridChatDocumentSpec.cpp" \
  -o "$BUILD_DIR/chat_history_test"

if [[ $# -gt 0 ]]; then
  "$BUILD_DIR/chat_history_test" "$@"
  exit
fi

"$BUILD_DIR/chat_history_test" "$ROOT_DIR/packages/chat-history/tests/fixtures"

clang++ -std=c++20 -Wall -Wextra -Werror -fobjc-arc \
  -framework Foundation -framework ImageIO -framework CoreGraphics \
  "$ROOT_DIR/packages/chat-history/tests/chat_image_test.mm" \
  "$ROOT_DIR/packages/chat-history/cpp/ChatImageDimensions.mm" \
  -o "$BUILD_DIR/chat_image_test"
"$BUILD_DIR/chat_image_test"

# Catch provider schema drift during the regular suite, not only manual audits.
# The audit reports SKIP when no local Codex chats are available.
"$BUILD_DIR/chat_history_test" --audit-recent 20
