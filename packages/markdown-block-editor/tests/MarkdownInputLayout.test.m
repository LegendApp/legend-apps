#import <AppKit/AppKit.h>
#import "ENRMInputMeasurement.h"

static void requireHeight(NSString *text, CGFloat fontSize, CGFloat lineHeight, CGFloat baselineOffset,
                          CGFloat width, CGFloat expectedHeight)
{
  NSMutableParagraphStyle *paragraph = [NSMutableParagraphStyle new];
  paragraph.minimumLineHeight = lineHeight;
  paragraph.maximumLineHeight = lineHeight;
  NSAttributedString *attributed = [[NSAttributedString alloc] initWithString:text attributes:@{
    NSFontAttributeName: [NSFont systemFontOfSize:fontSize],
    NSParagraphStyleAttributeName: paragraph,
    NSBaselineOffsetAttributeName: @(baselineOffset),
  }];
  CGFloat height = ENRMInputTextHeight(attributed, width);
  if (height != expectedHeight) {
    NSLog(@"FAIL input height %.1f != %.1f (baseline %.3f)", height, expectedHeight, baselineOffset);
    exit(1);
  }
}

int main()
{
  @autoreleasepool {
    NSString *line = @"Wrapped text should remain aligned when the cursor enters or leaves this block. ";
    for (NSNumber *baseline in @[@0, @3.875, @6]) {
      for (NSNumber *count in @[@1, @2, @6, @30]) {
        NSString *text = [@"" stringByPaddingToLength:line.length * count.unsignedIntegerValue
                                         withString:line startingAtIndex:0];
        requireHeight(text, 22, 34, baseline.doubleValue, 772, count.integerValue * 34);
      }
    }
    requireHeight(@"Heading", 44, 54, 0, 772, 54);
    requireHeight(@"Heading\nSecond line", 20, 26, 0, 772, 52);
    // The input prepares a mock glyph for an empty editor or trailing newline.
    requireHeight(@"I", 22, 34, 3.875, 772, 34);
    requireHeight(@"Text\nI", 22, 34, 3.875, 772, 68);
    NSLog(@"PASS 16 native Markdown input measurement cases");
  }
  return 0;
}
