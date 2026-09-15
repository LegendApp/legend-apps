#import <AppKit/AppKit.h>
#import "ENRMCodeBlockLineLayout.h"

static NSAttributedString *codeString(NSString *text, CGFloat lineHeight)
{
  NSMutableParagraphStyle *style = [NSMutableParagraphStyle new];
  style.minimumLineHeight = lineHeight;
  style.maximumLineHeight = lineHeight;
  return [[NSAttributedString alloc] initWithString:text attributes:@{
    NSFontAttributeName: [NSFont monospacedSystemFontOfSize:16 weight:NSFontWeightRegular],
    NSParagraphStyleAttributeName: style,
  }];
}

static void require(BOOL condition, NSString *message)
{
  if (!condition) { NSLog(@"FAIL %@", message); exit(1); }
}

static NSData *drawCode(NSAttributedString *code, BOOL useLineLayout, CGFloat scrollOffset)
{
  NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL pixelsWide:400 pixelsHigh:240
    bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
  memset(bitmap.bitmapData, 0, bitmap.bytesPerRow * bitmap.pixelsHigh);
  NSGraphicsContext *context = [NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap];
  CGContextTranslateCTM(context.CGContext, 0, 240);
  CGContextScaleCTM(context.CGContext, 1, -1);
  [NSGraphicsContext saveGraphicsState];
  [NSGraphicsContext setCurrentContext:[NSGraphicsContext graphicsContextWithCGContext:context.CGContext flipped:YES]];
  if (useLineLayout) {
    [[[ENRMCodeBlockLineLayout alloc] initWithAttributedCode:code] drawInRect:CGRectMake(0, 0, 400, 240) atPoint:CGPointMake(10, 10 - scrollOffset)];
  } else {
    [code drawAtPoint:CGPointMake(10, 10 - scrollOffset)];
  }
  [NSGraphicsContext restoreGraphicsState];
  return [NSData dataWithBytes:bitmap.bitmapData length:bitmap.bytesPerRow * bitmap.pixelsHigh];
}

int main()
{
  @autoreleasepool {
    NSArray<NSString *> *cases = @[@"", @"a", @"a\n", @"a\n\n", @"\n", @"\na", @"a\nb", @"a\r\nb",
      @"a\rb", @"a\u2028b\u2029c", @"👩🏽‍💻 café\n日本語", @"\tfoo\n  bar\tend", @"short\nlonger line"];
    for (NSNumber *height in @[@0, @17.5, @24]) {
      for (NSString *text in cases) {
        NSAttributedString *code = codeString(text, height.doubleValue);
        CGRect old = code.length ? [code boundingRectWithSize:CGSizeMake(CGFLOAT_MAX, CGFLOAT_MAX)
                                                    options:NSStringDrawingUsesLineFragmentOrigin context:nil] : CGRectZero;
        ENRMCodeBlockLineLayout *layout = [[ENRMCodeBlockLineLayout alloc] initWithAttributedCode:code];
        require(CGSizeEqualToSize(layout.size, CGSizeMake(ceil(old.size.width), ceil(old.size.height))),
                [NSString stringWithFormat:@"measure %@ at %@: %@ versus %@", text, height,
                  NSStringFromSize(layout.size), NSStringFromSize(old.size)]);
        require([ENRMCodeBlockLineLayout heightForAttributedCode:code] == layout.size.height, @"shadow and view heights agree");
        require([drawCode(code, YES, 0) isEqualToData:drawCode(code, NO, 0)], [NSString stringWithFormat:@"drawing %@ at %@", text, height]);
      }
    }
    NSMutableString *large = [NSMutableString new];
    for (NSUInteger index = 0; index < 12000; index++) {
      if (index) [large appendString:@"\n"];
      [large appendFormat:@"const item%lu = \"Code line %lu\";", index, index];
    }
    NSAttributedString *smallCode = codeString([large substringToIndex:[large rangeOfString:@"const item200 ="].location], 24);
    NSMutableAttributedString *colored = [smallCode mutableCopy];
    [colored addAttribute:NSForegroundColorAttributeName value:NSColor.systemRedColor range:NSMakeRange(20, 80)];
    for (NSNumber *offset in @[@0, @37, @2400, @4600]) {
      require([drawCode(colored, YES, offset.doubleValue) isEqualToData:drawCode(colored, NO, offset.doubleValue)],
              @"clipped drawing preserves highlighted text after distant jumps");
    }
    NSAttributedString *code = codeString(large, 24);
    CFAbsoluteTime started = CFAbsoluteTimeGetCurrent();
    ENRMCodeBlockLineLayout *layout = [[ENRMCodeBlockLineLayout alloc] initWithAttributedCode:code];
    require(layout.size.height == 12000 * 24, @"large block height");
    require([ENRMCodeBlockLineLayout heightForAttributedCode:code] == layout.size.height, @"fast large-block height");
    for (NSUInteger row = 0; row < 11980; row += 997) {
      NSRange visible = [layout lineRangeIntersectingRect:CGRectMake(0, row * 24, 800, 480)];
      require(visible.location == row && visible.length == 20, @"drawing visits only the viewport's lines after distant jumps");
    }
    require([layout lineRangeIntersectingRect:CGRectMake(0, -500, 800, 400)].length == 0, @"above block");
    require([layout lineRangeIntersectingRect:CGRectMake(0, layout.size.height, 800, 400)].length == 0, @"below block");
    NSLog(@"PASS %lu code layout cases and 12,000-line viewport checks (%.3f seconds)", cases.count * 3,
      CFAbsoluteTimeGetCurrent() - started);
  }
  return 0;
}
