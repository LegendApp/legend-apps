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

CMAKE_ARGS=(
  -DCMAKE_BUILD_TYPE=Release
  -DBUILD_SHARED_LIBS=OFF
)

if [ "$(uname -s)" = "Darwin" ]; then
  CMAKE_ARGS+=(
    "-DCMAKE_OSX_ARCHITECTURES=arm64;x86_64"
    -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0
  )
fi

cmake -S "$TML_DIR" -B "$TML_DIR/build" "${CMAKE_ARGS[@]}"

cmake --build "$TML_DIR/build" --target tml -- -j4
