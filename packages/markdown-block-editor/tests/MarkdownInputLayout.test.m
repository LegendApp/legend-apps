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
    NSMutableParagraphStyle *paragraph = [NSMutableParagraphStyle new];
    paragraph.minimumLineHeight = paragraph.maximumLineHeight = 34;
    NSDictionary *attrs = @{ NSFontAttributeName: [NSFont systemFontOfSize:22],
                             NSParagraphStyleAttributeName: paragraph };
    NSMutableAttributedString *source = [[NSMutableAttributedString alloc] initWithString:@"Wrapped text should remain aligned."
                                                                              attributes:attrs];
    NSAttributedString *snapshot = ENRMPrepareInputMeasurementText(source, attrs);
    CGFloat originalHeight = ENRMInputTextHeight(snapshot, 180);
    paragraph.minimumLineHeight = paragraph.maximumLineHeight = 90;
    [source replaceCharactersInRange:NSMakeRange(0, source.length) withString:@"Changed"];
    if (![snapshot.string isEqualToString:@"Wrapped text should remain aligned."] ||
        ENRMInputTextHeight(snapshot, 180) != originalHeight) {
      NSLog(@"FAIL measurement snapshot shares mutable editor data");
      return 1;
    }
    NSDictionary *frozenAttrs = [snapshot attributesAtIndex:0 effectiveRange:NULL];
    NSAttributedString *empty = ENRMPrepareInputMeasurementText([[NSAttributedString alloc] initWithString:@""], frozenAttrs);
    NSAttributedString *newline = ENRMPrepareInputMeasurementText([[NSAttributedString alloc] initWithString:@"Text\n" attributes:frozenAttrs], frozenAttrs);
    if (ENRMInputTextHeight(empty, 772) != 34 || ENRMInputTextHeight(newline, 772) != 68) {
      NSLog(@"FAIL empty or trailing newline snapshot measurement");
      return 1;
    }

    CGFloat widths[] = { 80, 180, 772 };
    CGFloat expected[3];
    for (int i = 0; i < 3; i++) expected[i] = ENRMInputTextHeight(snapshot, widths[i]);
    dispatch_group_t workers = dispatch_group_create();
    __block BOOL failed = NO;
    NSObject *lock = [NSObject new];
    for (int i = 0; i < 3; i++) {
      CGFloat width = widths[i], height = expected[i];
      dispatch_group_async(workers, dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        @autoreleasepool {
          for (int j = 0; j < 20; j++) {
            if (ENRMInputTextHeight(snapshot, width) != height) {
              @synchronized (lock) { failed = YES; }
            }
          }
        }
      });
    }
    // Keep main blocked: measurement must never need its queue or a live editor.
    if (dispatch_group_wait(workers, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC)) != 0 || failed) {
      NSLog(@"FAIL concurrent background layout while main is blocked");
      return 1;
    }
    NSLog(@"PASS native input layout, immutable snapshots, and 60 background measurements");
  }
  return 0;
}
