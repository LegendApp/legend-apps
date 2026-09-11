#import "../macos/SourceInputView.h"
#include "../cpp/SourceDocument.hpp"
#include "../../syntax-parser/cpp/IncrementalSyntaxHighlighter.hpp"
#include <cassert>
#include <fstream>
#include <iostream>
#include <sstream>

namespace syntax = margelo::nitro::legendapps::syntaxparser;
static std::shared_ptr<syntax::TextMateHighlighterContext> grammar;

// Use the real native scheduler with explicit test grammar assets, independent
// of the user's installed themes or whether this executable is an app bundle.
@interface LESourceInputView (SchedulingTests)
- (void)recordStartupDraw;
@end
@interface SchedulingInput : LESourceInputView
@end
@implementation SchedulingInput
- (std::shared_ptr<syntax::IncrementalSyntaxHighlighter>)createSyntaxHighlighter {
  return std::make_shared<syntax::IncrementalSyntaxHighlighter>(grammar);
}
@end

static NSUInteger highlighted(SchedulingInput *input) {
  return [[input valueForKey:@"syntaxNextLine"] unsignedIntegerValue];
}
static void drainFor(NSTimeInterval seconds) {
  [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:seconds]];
}
static void waitFor(bool (^condition)(void)) {
  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:10];
  while (!condition() && deadline.timeIntervalSinceNow > 0) drainFor(0.005);
  assert(condition());
}

int main(int argc, char **argv) {
  assert(argc == 2);
  const std::string root = argv[1];
  auto onig = textmate_oniglib_create();
  auto registry = textmate_registry_create(onig);
  assert(textmate_registry_add_grammar_from_file(registry, (root + "/tm-grammars/grammars/typescript.json").c_str()));
  std::ifstream file(root + "/tm-themes/themes/dark-plus.json");
  std::ostringstream json; json << file.rdbuf();
  assert(textmate_registry_set_theme(registry, json.str().c_str()));
  auto loaded = textmate_registry_load_grammar(registry, "source.ts");
  assert(loaded);
  grammar = std::make_shared<syntax::TextMateHighlighterContext>(onig, registry, loaded, textmate_registry_get_color_map(registry));

  @autoreleasepool {
    [NSApplication sharedApplication];
    for (bool unique : {false, true}) {
      SchedulingInput *jump = [[SchedulingInput alloc] initWithFrame:NSMakeRect(0, 0, 600, 400)];
      NSString *sample = @"const sample = 42;\n";
      NSMutableString *source = [NSMutableString new];
      if (unique) {
        for (NSUInteger index = 0; index < 100000; ++index) [source appendFormat:@"const sample%lu = %lu;\n", index, index];
      } else [source appendString:[sample stringByPaddingToLength:sample.length * 100000 withString:sample startingAtIndex:0]];
      [jump loadSource:source];
      [jump configureSyntaxLanguage:@"typescript" theme:@"dark-plus" enabled:YES];
      waitFor(^bool { return highlighted(jump) == 128; });
      const auto started = [NSDate timeIntervalSinceReferenceDate];
      LESourceRowView *last = [[LESourceRowView alloc] initWithFrame:NSMakeRect(0, 0, 600, 24)];
      last.lineIndex = 99999; last.lineId = 100000; last.input = jump;
      waitFor(^bool { return highlighted(jump) >= 100000; });
      std::cout << "Exact highlighting after 100k-line jump (" << (unique ? "unique" : "repeated") << "): " << ([NSDate timeIntervalSinceReferenceDate] - started) * 1000 << "ms\n";
      last.input = nil;
    }
    SchedulingInput *input = [[SchedulingInput alloc] initWithFrame:NSMakeRect(0, 0, 600, 400)];
    __block NSUInteger progressEvents = 0, completedLines = 0, totalLines = 0;
    __block BOOL progressActive = NO;
    input.onSyntaxProgress = ^(NSUInteger completed, NSUInteger total, BOOL active) {
      ++progressEvents; completedLines = completed; totalLines = total; progressActive = active;
      assert(completed <= total);
    };
    input.onSyntaxError = ^(NSString *error) { assert(!error.length); };
    NSString *line = @"const value = 42;\n";
    NSString *source = [line stringByPaddingToLength:line.length * 20000 withString:line startingAtIndex:0];
    [input loadSource:source];
    [input configureSyntaxLanguage:@"typescript" theme:@"dark-plus" enabled:YES];
    assert(!input.syntaxHighlightingInBackground);
    waitFor(^bool { return highlighted(input) == 128; });
    drainFor(0.05);
    assert(highlighted(input) == 128); // viewport mode does not visit the tail

    input.syntaxHighlightingInBackground = YES;
    drainFor(0.05);
    assert(highlighted(input) == 128); // first paint has priority in both modes
    [input recordStartupDraw];
    input.syntaxHighlightingInBackground = NO;
    waitFor(^bool { return ![[input valueForKey:@"syntaxBusy"] boolValue]; });
    drainFor(0.05);
    const auto paused = highlighted(input);
    assert(paused >= 128 && paused <= 128 + 2048); // at most one bounded catch-up batch finishes
    input.syntaxHighlightingInBackground = YES;
    waitFor(^bool { return highlighted(input) == input.lineCount; });
    assert([input.source isEqualToString:source]);
    drainFor(0.01);
    assert(!progressActive && completedLines == input.lineCount && totalLines == input.lineCount);
    assert(progressEvents >= 2 && progressEvents < 100); // not a render update per line

    // A far-away row is colored immediately on mount, without another job.
    const auto complete = highlighted(input);
    LESourceRowView *row = [[LESourceRowView alloc] initWithFrame:NSMakeRect(0, 0, 600, 24)];
    row.lineIndex = 15000; row.lineId = 15001; row.input = input;
    [row layout];
    NSAttributedString *text = [row.textLayout valueForKey:@"text"];
    assert(text.length > 0);
    NSColor *color = [text attribute:NSForegroundColorAttributeName atIndex:0 effectiveRange:nil];
    assert(color && ![color isEqual:row.foreground]);
    assert(highlighted(input) == complete);
    row.input = nil;

    // Streaming appends resume background work but not viewport-only work.
    input.syntaxHighlightingInBackground = NO;
    legend::source::SourceDocument tail(u"\nconst appended = true;\n", input.lineCount);
    [input appendDocument:std::move(tail)];
    drainFor(0.05);
    assert(highlighted(input) <= complete);
    input.syntaxHighlightingInBackground = YES;
    waitFor(^bool { return highlighted(input) == input.lineCount; });

    // An edit and undo revalidate cached downstream parser states in background.
    input.undoManager.groupsByEvent = NO;
    NSString *before = input.source;
    [input.undoManager beginUndoGrouping];
    [input insertText:@"/*\n" replacementRange:NSMakeRange(0, 0)];
    [input.undoManager endUndoGrouping];
    waitFor(^bool { return highlighted(input) == input.lineCount; });
    [input.undoManager undo];
    waitFor(^bool { return highlighted(input) == input.lineCount; });
    assert([input.source isEqualToString:before]);

    // Disabling highlighting cancels scheduling, including queued continuations.
    [input loadSource:source];
    [input recordStartupDraw];
    [input configureSyntaxLanguage:@"typescript" theme:@"dark-plus" enabled:NO];
    drainFor(0.05);
    assert(highlighted(input) == 0);

    // Replace documents while batches are in flight. A stale completion must
    // not color a new document with an old multiline-comment parser state.
    for (NSUInteger attempt = 0; attempt < 12; ++attempt) {
      [input configureSyntaxLanguage:@"typescript" theme:@"dark-plus" enabled:YES];
      [input loadSource:[@"/*\n" stringByAppendingString:source]];
      [input recordStartupDraw];
      [input loadSource:@"const fresh = 42;\nconst next = true;\n"];
      [input recordStartupDraw];
      waitFor(^bool { return highlighted(input) == input.lineCount && ![[input valueForKey:@"syntaxBusy"] boolValue]; });
      drainFor(0.01);
      assert([input.source isEqualToString:@"const fresh = 42;\nconst next = true;\n"]);
      row.lineIndex = 0; row.lineId = 1; row.input = input;
      [row layout];
      NSAttributedString *actual = [row.textLayout valueForKey:@"text"];
      assert([actual.string isEqualToString:@"const fresh = 42;"]);
      NSColor *keyword = [actual attribute:NSForegroundColorAttributeName atIndex:0 effectiveRange:nil];
      assert([keyword isEqual:color]); // same TS keyword as the clean document
      row.input = nil;
    }
  }
  std::cout << "Source syntax scheduling: viewport/default, first-paint priority, background EOF, cached offscreen rows, mode switching, append, edit/undo and disable passed\n";
}
