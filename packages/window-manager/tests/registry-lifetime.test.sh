#!/bin/bash
set -euo pipefail
package_dir="$(cd "$(dirname "$0")/.." && pwd)"
test_dir="$(mktemp -d)"
trap 'rm -rf "$test_dir"' EXIT
xcrun clang++ -fobjc-arc -fblocks -framework AppKit -framework CoreImage \
  -I "$package_dir/ios" "$package_dir/ios/LegendWindowRegistry.mm" \
  "$package_dir/tests/registry-lifetime.test.mm" -o "$test_dir/registry-lifetime"
"$test_dir/registry-lifetime"
