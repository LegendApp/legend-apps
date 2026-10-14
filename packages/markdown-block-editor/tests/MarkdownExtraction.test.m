#import <AppKit/AppKit.h>
#import "MarkdownExtractor.h"
#import "BaselineShiftTextAttributes.h"

// Attachment classes and attribute keys are linked here without their rendering dependencies.
@interface ENRMImageAttachment : NSTextAttachment
@property NSString *imageURL;
@property BOOL isInline;
@end
@implementation ENRMImageAttachment
@end
@interface ThematicBreakAttachment : NSTextAttachment
@end
@implementation ThematicBreakAttachment
@end
NSString *const MarkdownTypeAttributeName = @"MarkdownType";
NSString *const ListDepthAttribute = @"ListDepth";
NSString *const ListTypeAttribute = @"ListType";
NSString *const ListItemNumberAttribute = @"ListItemNumber";
NSString *const TaskItemAttribute = @"TaskItem";
NSString *const TaskCheckedAttribute = @"TaskChecked";

int main() {
  @autoreleasepool {
    NSString *html = @"<b>BOLD</b> <i>ITALIC</i> ";
    NSString *imported = extractMarkdownFromHTML([html dataUsingEncoding:NSUTF8StringEncoding]);
    if (![imported isEqualToString:@"**BOLD** *ITALIC* "]) {
      NSLog(@"FAIL rich HTML paste: %@", imported);
      return 1;
    }

    for (NSNumber *baseline in @[@0, @3, @-2]) {
      NSMutableAttributedString *text = [[NSMutableAttributedString alloc] initWithString:@"Alpha normal text."
        attributes:@{NSFontAttributeName: [NSFont systemFontOfSize:16], NSBaselineOffsetAttributeName: baseline}];
      NSString *actual = extractMarkdownFromAttributedString(text, NSMakeRange(6, 6));
      if (![actual isEqualToString:@"normal"]) {
        NSLog(@"FAIL layout baseline %@ changed partial selection to %@", baseline, actual);
        return 1;
      }
    }
    for (NSString *script in @[ENRMScriptValueSuperscript, ENRMScriptValueSubscript]) {
      for (NSNumber *baseline in @[@0, @3, @-2]) {
        NSAttributedString *text = [[NSAttributedString alloc] initWithString:@"x2y"
          attributes:@{NSFontAttributeName: [NSFont systemFontOfSize:12],
            NSBaselineOffsetAttributeName: baseline, ENRMScriptAttributeName: script}];
        NSString *expected = [script isEqualToString:ENRMScriptValueSuperscript] ? @"^2^" : @"~2~";
        NSString *actual = extractMarkdownFromAttributedString(text, NSMakeRange(1, 1));
        if (![actual isEqualToString:expected]) {
          NSLog(@"FAIL script %@ with baseline %@: %@", script, baseline, actual);
          return 1;
        }
      }
    }
    NSLog(@"PASS 9 partial selection cases: layout offsets and semantic scripts");
  }
  return 0;
}
