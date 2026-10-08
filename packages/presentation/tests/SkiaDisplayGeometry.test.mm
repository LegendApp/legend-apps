#import <AppKit/AppKit.h>
#import <objc/runtime.h>

#include "MetalWindowContext.h"

static CGFloat screenDensity = 1;
static int failures = 0;

@interface NSScreen (DisplayGeometryTest)
- (CGFloat)testBackingScaleFactor;
@end
@implementation NSScreen (DisplayGeometryTest)
- (CGFloat)testBackingScaleFactor { return screenDensity; }
@end

static void expect(bool passed, const char *message) {
  if (!passed) {
    fprintf(stderr, "FAIL: %s\n", message);
    ++failures;
  }
}

static void checkCanvas(CAMetalLayer *layer, CGSize logicalSize,
                        CGFloat rasterDensity, CGFloat displayDensity) {
  screenDensity = displayDensity;
  layer.frame = CGRectMake(0, 0, logicalSize.width, logicalSize.height);
  int width = logicalSize.width * rasterDensity;
  int height = logicalSize.height * rasterDensity;
  id<MTLDevice> device = MTLCreateSystemDefaultDevice();
  MetalWindowContext context(nullptr, device, [device newCommandQueue], layer,
                             width, height, false);
  expect(layer.contentsScale == rasterDensity,
         "layer scale must match picture raster density, not the main screen");
  expect(context.getWidth() == width && context.getHeight() == height,
         "surface dimensions must match allocated drawable pixels");
  expect([layer.contentsGravity isEqual:kCAGravityResize],
         "drawable must fill canvas bounds on every display");

  // AppKit can change layer scale after a window moves to another display.
  layer.contentsScale = displayDensity;
  expect(context.getWidth() == width && context.getHeight() == height,
         "backing changes must not change snapshot dimensions");
  expect(CGSizeEqualToSize(layer.drawableSize, CGSizeMake(width, height)),
         "backing changes must retain the complete picture drawable");
}

int main() {
  @autoreleasepool {
    [NSApplication sharedApplication];
    Method actual = class_getInstanceMethod(NSScreen.class,
                                            @selector(backingScaleFactor));
    Method controlled = class_getInstanceMethod(NSScreen.class,
                                                @selector(testBackingScaleFactor));
    method_exchangeImplementations(actual, controlled);
    CAMetalLayer *layer = [CAMetalLayer layer];
    // A Retina-launched renderer opens/reopens on a 1920x1080 projector.
    checkCanvas(layer, CGSizeMake(1920, 1080), 2, 1);
    checkCanvas(layer, CGSizeMake(1920, 1080), 2, 1);
    // The Directory logo uses the same layer path at a much smaller size.
    checkCanvas(layer, CGSizeMake(125, 110), 2, 1);
    // Resize, change resolution, and move back to a Retina display.
    checkCanvas(layer, CGSizeMake(1280, 720), 2, 1);
    checkCanvas(layer, CGSizeMake(1920, 1080), 2, 2);
    // Also cover launch on a projector followed by a Retina window.
    checkCanvas(layer, CGSizeMake(1920, 1080), 1, 2);
    method_exchangeImplementations(actual, controlled);
    if (!failures) puts("Skia display geometry: all native checks passed");
  }
  return failures ? 1 : 0;
}
