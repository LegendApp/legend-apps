#!/bin/bash
set -euo pipefail
package_dir="$(cd "$(dirname "$0")/.." && pwd)"
test_dir="$(mktemp -d)"
trap 'rm -rf "$test_dir"' EXIT
cat > "$test_dir/main.mm" <<'SOURCE'
#import <AppKit/AppKit.h>
extern "C" void LegendPrepareSidebarSplitViewStartup(NSWindow *, NSDictionary *) __attribute__((weak_import));
extern "C" BOOL LegendAttachSidebarSplitViewStartupRoot(NSWindow *, NSView *, void (^)(void)) __attribute__((weak_import));
extern "C" void LegendFinishSidebarSplitViewStartup(NSWindow *) __attribute__((weak_import));
int main() {
  LegendPrepareSidebarSplitViewStartup(nil, nil);
  BOOL attached = LegendAttachSidebarSplitViewStartupRoot(nil, nil, ^{});
  LegendFinishSidebarSplitViewStartup(nil);
  return attached == EXPECT_ATTACHED ? 0 : 1;
}
SOURCE
cat > "$test_dir/strong.mm" <<'SOURCE'
#import <AppKit/AppKit.h>
extern "C" void LegendPrepareSidebarSplitViewStartup(NSWindow *, NSDictionary *) {}
extern "C" BOOL LegendAttachSidebarSplitViewStartupRoot(NSWindow *, NSView *, void (^)(void)) { return YES; }
extern "C" void LegendFinishSidebarSplitViewStartup(NSWindow *) {}
SOURCE
for optimization in -O0 -flto=thin; do
  xcrun clang++ -fobjc-arc -fblocks -O2 "$optimization" -framework AppKit -DEXPECT_ATTACHED=0 \
    "$test_dir/main.mm" "$package_dir/ios/SidebarStartupFallbacks.mm" -o "$test_dir/optional"
  "$test_dir/optional"
  xcrun clang++ -fobjc-arc -fblocks -O2 "$optimization" -framework AppKit -DEXPECT_ATTACHED=1 \
    "$test_dir/main.mm" "$package_dir/ios/SidebarStartupFallbacks.mm" "$test_dir/strong.mm" -o "$test_dir/included"
  "$test_dir/included"
done
printf 'Sidebar startup hooks link with and without the optional implementation, including ThinLTO.\n'
