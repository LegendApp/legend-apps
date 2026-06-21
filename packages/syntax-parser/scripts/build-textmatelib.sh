#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEXTMATE_DIR="$ROOT_DIR/vendor/TextMateLib"
TML_DIR="$TEXTMATE_DIR/packages/tml-cpp"

if [ ! -d "$TEXTMATE_DIR/thirdparty/oniguruma/src" ] ||
  [ ! -d "$TEXTMATE_DIR/thirdparty/rapidjson/include" ] ||
  [ ! -d "$TEXTMATE_DIR/thirdparty/rapidjson/thirdparty/gtest/googletest" ] ||
  [ ! -d "$TEXTMATE_DIR/thirdparty/textmate-grammars-themes/packages/tm-grammars/raw" ]; then
  if command -v git >/dev/null 2>&1 && [ -d "$TEXTMATE_DIR/.git" ]; then
    git -C "$TEXTMATE_DIR" submodule update --init --recursive
  fi
fi

cmake -S "$TML_DIR" -B "$TML_DIR/build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF

cmake --build "$TML_DIR/build" --target tml -- -j4
