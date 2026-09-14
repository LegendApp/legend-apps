#import "../macos/SourceInputView.h"
#include "../cpp/SourceDocument.hpp"
#include "../cpp/SourceTreeSyntax.hpp"
#include "../../syntax-parser/cpp/SyntaxHighlighter.hpp"
#include "../../syntax-parser/cpp/TreeSitterHighlighter.hpp"
#include <cassert>
#include <fstream>
#include <iostream>
#include <sstream>
#include <algorithm>

namespace syntax = margelo::nitro::legendapps::syntaxparser;

// Use the real native scheduler with explicit test grammar assets, independent
// of the user's installed themes or whether this executable is an app bundle.
@interface LESourceInputView (SchedulingTests)
- (void)recordStartupDraw;
- (std::vector<syntax::SyntaxStyle>)resolveTreeStyles:(const std::vector<std::vector<std::string>>&)scopes theme:(NSString *)theme;
@end
@interface SchedulingInput : LESourceInputView
@end
@implementation SchedulingInput
- (std::vector<syntax::SyntaxStyle>)resolveTreeStyles:(const std::vector<std::vector<std::string>>&)scopes theme:(NSString *)theme {
  std::vector<syntax::SyntaxStyle> styles;
  for (size_t i = 0; i < scopes.size(); ++i) styles.emplace_back(i,
    (scopes[i].back() == "keyword.control" || scopes[i].back() == "markup.heading") ? ([theme isEqualToString:@"light"] ? "#ff0000" : "#0000ff")
      : scopes[i].back() == "constant.numeric" ? "#00ff00" : "#eeeeee", 0);
  return styles;
}
@end

@interface WindowedSyntaxRow : LESourceRowView
@property (nonatomic) NSRect testVisibleRect;
@end
@implementation WindowedSyntaxRow
- (NSRect)visibleRect { return self.testVisibleRect; }
@end

static NSUInteger highlighted(SchedulingInput *input) {
  return [[input valueForKey:@"treeNextLine"] unsignedIntegerValue];
}
static void drainFor(NSTimeInterval seconds) {
  [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:seconds]];
}
static void waitFor(bool (^condition)(void), int caller = __builtin_LINE()) {
  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:10];
  while (!condition() && deadline.timeIntervalSinceNow > 0) drainFor(0.005);
  if (!condition()) std::cerr << "Timed out at scheduling test line " << caller << '\n';
  assert(condition());
}

int main(int argc, char **argv) {
  @autoreleasepool {
    {
      // A queued edit must run before a large initial parse finishes. Unlike a
      // CPU yield inside parse(), one slice gives the serial executor back.
      auto worker = std::make_shared<legend::source::SourceTreeSyntax>("typescript");
      std::u16string source;
      for (int i = 0; i < 100000; ++i) source += u"const sample = 42;\n";
      worker->replace(0, 0, source);
      auto queue = dispatch_queue_create("syntax-slice-test", DISPATCH_QUEUE_SERIAL);
      __block bool complete = true;
      dispatch_async(queue, ^{ complete = worker->parseSlice(); });
      dispatch_sync(queue, ^{
        assert(!complete);
        worker->replace(6, 6, u"edited");
      });
      dispatch_sync(queue, ^{ assert(worker->parse()); });
      source.replace(6, 6, u"edited");
      legend::source::SourceTreeSyntax fresh("typescript");
      fresh.replace(0, 0, source); assert(fresh.parse());
      const auto actual = worker->highlight(0, 80), expected = fresh.highlight(0, 80);
      for (size_t i = 0; i < actual.size(); ++i) assert(actual[i].tokens == expected[i].tokens);
    }
    [NSApplication sharedApplication];
    for (BOOL wrap : {NO, YES}) {
      SchedulingInput *input = [[SchedulingInput alloc] initWithFrame:NSMakeRect(0, 0, 600, 400)];
      input.syntaxHighlightingInBackground = NO;
      input.onSyntaxError = ^(NSString *error) { assert(!error.length); };
      NSMutableString *source = [NSMutableString new];
      for (int i = 0; i < 6000; ++i) [source appendString:@"const value=42; "];
      [input loadSource:source];
      [input configureSyntaxLanguage:@"javascript" theme:@"dark-plus" enabled:YES];
      [input recordStartupDraw];
      WindowedSyntaxRow *row = [[WindowedSyntaxRow alloc] initWithFrame:NSMakeRect(0, 0, 600, 400)];
      row.wrap = wrap; row.lineIndex = 0; row.lineId = 1; row.input = input;
      [row layout];
      for (NSUInteger target : {NSUInteger{45008}, NSUInteger{75008}, NSUInteger{0}}) {
        const auto caret = [row.textLayout caretRectAtOffset:target downstream:YES];
        row.testVisibleRect = NSMakeRect(wrap ? 0 : caret.origin.x + 64, wrap ? caret.origin.y : 0, 600, 300);
        [input requestVisibleSyntax];
        waitFor(^bool {
          [input requestVisibleSyntax];
          return [[input valueForKey:@"treeVisibleRevision"] isEqual:[input valueForKey:@"treeRevision"]]
            && [[input valueForKey:@"treeVisibleFromOffset"] unsignedIntegerValue] <= target
            && [[input valueForKey:@"treeVisibleToOffset"] unsignedIntegerValue] > target;
        });
        assert([[input valueForKey:@"treeVisibleToOffset"] unsignedIntegerValue]
          - [[input valueForKey:@"treeVisibleFromOffset"] unsignedIntegerValue] < source.length / 2);
        waitFor(^bool {
          [row layout]; NSAttributedString *text = [row.textLayout valueForKey:@"text"];
          return [[text attribute:NSForegroundColorAttributeName atIndex:target effectiveRange:nil]
            isEqual:[NSColor colorWithSRGBRed:0 green:0 blue:1 alpha:1]];
        });
      }
      // Finishing a small invalidation can leave an unfinished background tail.
      // An empty dirty interval must not reset that tail's character cursor.
      [input setValue:@0 forKey:@"treeDirtyEnd"];
      input.syntaxHighlightingInBackground = YES;
      waitFor(^bool { return highlighted(input) == input.lineCount; });
      input.undoManager.groupsByEvent = NO;
      [input.undoManager beginUndoGrouping];
      [input insertText:@"/*" replacementRange:NSMakeRange(75008, 5)];
      [input.undoManager endUndoGrouping];
      waitFor(^bool { return highlighted(input) == input.lineCount; });
      [row layout];
      NSAttributedString *commented = [row.textLayout valueForKey:@"text"];
      assert(![[commented attribute:NSForegroundColorAttributeName atIndex:89997 effectiveRange:nil]
        isEqual:[NSColor colorWithSRGBRed:0 green:0 blue:1 alpha:1]]);
      [input.undoManager undo];
      waitFor(^bool { return highlighted(input) == input.lineCount; });
      [row layout];
      NSAttributedString *restored = [row.textLayout valueForKey:@"text"];
      assert([[restored attribute:NSForegroundColorAttributeName atIndex:90000 effectiveRange:nil]
        isEqual:[NSColor colorWithSRGBRed:0 green:0 blue:1 alpha:1]]);
      assert([input.source isEqualToString:source]);
      row.input = nil;
      [input configureSyntaxLanguage:@"javascript" theme:@"dark-plus" enabled:NO];
    }
    {
      SchedulingInput *tree = [[SchedulingInput alloc] initWithFrame:NSMakeRect(0, 0, 600, 400)];
      tree.syntaxBackend = @"tree-sitter";
      tree.syntaxHighlightingInBackground = YES;
      tree.onSyntaxError = ^(NSString *error) { if (error.length) std::cerr << error.UTF8String << "\n"; assert(!error.length); };
      NSMutableString *source = [NSMutableString new];
      for (NSUInteger i = 0; i < 10000; ++i) [source appendFormat:@"const sample%lu = %lu;\n", i, i];
      [tree loadSource:source];
      [tree configureSyntaxLanguage:@"typescript" theme:@"dark-plus" enabled:YES];
      waitFor(^bool { return [[tree valueForKey:@"treePrefixDone"] boolValue]; });
      assert([[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] <= 128);
      [tree recordStartupDraw];
      waitFor(^bool { return [[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] == tree.lineCount; });
      LESourceRowView *row = [[LESourceRowView alloc] initWithFrame:NSMakeRect(0, 0, 600, 24)];
      row.lineIndex = 9000; row.lineId = 9001; row.input = tree;
      [row layout];
      NSAttributedString *text = [row.textLayout valueForKey:@"text"];
      NSColor *keyword = [text attribute:NSForegroundColorAttributeName atIndex:0 effectiveRange:nil];
      assert([keyword isEqual:[NSColor colorWithSRGBRed:0 green:0 blue:1 alpha:1]]);
      // Far rows retain colors immediately while a leading structural edit runs.
      tree.undoManager.groupsByEvent = NO;
      [tree.undoManager beginUndoGrouping];
      [tree insertText:@"/*" replacementRange:NSMakeRange(0, 0)];
      [tree.undoManager endUndoGrouping];
      [row layout];
      text = [row.textLayout valueForKey:@"text"];
      assert([[text attribute:NSForegroundColorAttributeName atIndex:0 effectiveRange:nil] isEqual:keyword]);
      waitFor(^bool { return [[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] == tree.lineCount; });
      [tree.undoManager undo];
      waitFor(^bool { return [[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] == tree.lineCount; });
      assert([tree.source isEqualToString:source]);
      [tree configureSyntaxLanguage:@"typescript" theme:@"light" enabled:YES];
      waitFor(^bool {
        [row layout]; NSAttributedString *current = [row.textLayout valueForKey:@"text"];
        return [[current attribute:NSForegroundColorAttributeName atIndex:0 effectiveRange:nil] isEqual:[NSColor colorWithSRGBRed:1 green:0 blue:0 alpha:1]];
      });
      row.input = nil;
      if (argc == 2 && std::string(argv[1]) == "--measure") {
        const auto percentile = [](std::vector<double> values, double p) {
          std::sort(values.begin(), values.end()); return values[std::min(values.size() - 1, static_cast<size_t>(p * values.size()))];
        };
        for (NSUInteger line : {NSUInteger{0}, NSUInteger{5000}, NSUInteger{9999}}) {
          row.lineIndex = line; row.lineId = line + 1; row.input = tree;
          const auto offset = [tree offsetForRow:row] + 6;
          std::vector<double> inputTimes, colorTimes;
          for (int i = 0; i < 50; ++i) {
            [tree.undoManager beginUndoGrouping];
            const auto began = NSProcessInfo.processInfo.systemUptime;
            [tree insertText:@"x" replacementRange:NSMakeRange(offset, 0)];
            inputTimes.push_back((NSProcessInfo.processInfo.systemUptime - began) * 1000);
            [tree.undoManager endUndoGrouping];
            NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:10];
            while (![[tree valueForKey:@"treeVisibleRevision"] isEqual:[tree valueForKey:@"treeRevision"]] && deadline.timeIntervalSinceNow > 0) drainFor(0.0001);
            assert(deadline.timeIntervalSinceNow > 0);
            [row layout];
            colorTimes.push_back((NSProcessInfo.processInfo.systemUptime - began) * 1000);
            [tree.undoManager undo];
            waitFor(^bool { return [[tree valueForKey:@"treeVisibleRevision"] isEqual:[tree valueForKey:@"treeRevision"]]; });
          }
          std::cout << "Tree native 10k line=" << line << " input p50/p95/p99=" << percentile(inputTimes, .5) << "/" << percentile(inputTimes, .95) << "/" << percentile(inputTimes, .99)
            << "ms; edit-to-layout=" << percentile(colorTimes, .5) << "/" << percentile(colorTimes, .95) << "/" << percentile(colorTimes, .99) << "ms\n";
          assert([tree.source isEqualToString:source]); row.input = nil;
        }
      }
      // Edits during partial mirroring, CRLF joins, loading completion and reset.
      tree.sourceLoading = YES;
      [tree loadSource:@"const first = 1;\r"];
      [tree recordStartupDraw];
      [tree.undoManager beginUndoGrouping];
      [tree insertText:@"x" replacementRange:NSMakeRange(6, 0)];
      [tree.undoManager endUndoGrouping];
      legend::source::SourceDocument tail(u"\nconst second = 2;", 2);
      [tree appendDocument:std::move(tail)];
      tree.sourceLoading = NO;
      waitFor(^bool { return [[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] == tree.lineCount; });
      assert([tree.source isEqualToString:@"const xfirst = 1;\r\nconst second = 2;"]);
      for (int i = 0; i < 5; ++i) {
        [tree loadSource:source]; [tree recordStartupDraw];
        [tree loadSource:@"const fresh = 1;\n"]; [tree recordStartupDraw];
        waitFor(^bool { return [[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] == tree.lineCount; });
      }
      [tree.undoManager beginUndoGrouping];
      [tree setMarkedText:@"n" selectedRange:NSMakeRange(1, 0) replacementRange:NSMakeRange(6, 5)];
      [tree setMarkedText:@"ni" selectedRange:NSMakeRange(2, 0) replacementRange:NSMakeRange(NSNotFound, 0)];
      [tree insertText:@"你" replacementRange:NSMakeRange(NSNotFound, 0)];
      [tree.undoManager endUndoGrouping];
      waitFor(^bool { return [[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] == tree.lineCount; });
      assert(!tree.hasMarkedText && [tree.source isEqualToString:@"const 你 = 1;\n"]);
      [tree.undoManager undo];
      waitFor(^bool { return [[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] == tree.lineCount; });
      assert([tree.source isEqualToString:@"const fresh = 1;\n"]);
      // Each additional grammar must actually travel through the native worker,
      // resolve its own root scope, and replace tokens on a language switch.
      for (NSDictionary *fixture in @[
        @{@"language": @"javascript", @"source": @"const view = <View />;\n"},
        @{@"language": @"json", @"source": @"42\n"},
        @{@"language": @"css", @"source": @"@media screen { .item { color: red; } }\n"},
        @{@"language": @"python", @"source": @"def greet():\n    return 42\n"},
        @{@"language": @"markdown", @"source": @"# Heading\n\n**bold**\n\n```tsx\nconst view = <View />;\n```\n", @"offset": @2},
        @{@"language": @"mdx", @"source": @"import { View } from 'react-native';\n\n# Heading\n\n<View opacity={0.5} />\n"},
      ]) {
        [tree configureSyntaxLanguage:fixture[@"language"] theme:@"dark-plus" enabled:YES];
        [tree loadSource:fixture[@"source"]]; [tree recordStartupDraw];
        waitFor(^bool { return [[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] == tree.lineCount; });
        row.lineIndex = 0; row.lineId = 1; row.input = tree;
        waitFor(^bool {
          [row invalidateText]; [row layout];
          NSAttributedString *current = [row.textLayout valueForKey:@"text"];
          const BOOL number = [fixture[@"language"] isEqualToString:@"json"];
          const auto offset = [fixture[@"offset"] unsignedIntegerValue];
          NSColor *expected = [NSColor colorWithSRGBRed:0 green:number ? 1 : 0 blue:number ? 0 : 1 alpha:1];
          return current.length > offset && [[current attribute:NSForegroundColorAttributeName atIndex:offset effectiveRange:nil] isEqual:expected];
        });
        row.input = nil;
      }
      __block NSUInteger grammarRequests = 0;
      tree.onGrammarRequired = ^(NSString *language) {
        assert([language isEqualToString:@"rust"]); ++grammarRequests;
      };
      [tree configureSyntaxLanguage:@"markdown" theme:@"dark-plus" enabled:YES];
      NSString *fence = @"# Download test\n\n```rust\nfn main() {}\n```\n";
      [tree loadSource:fence]; [tree recordStartupDraw];
      waitFor(^bool { return [[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] == tree.lineCount; });
      assert(grammarRequests == 1);
      const auto copiedBefore = [[tree valueForKey:@"treeCopiedUnits"] unsignedIntegerValue];
      ++tree.grammarRevision;
      assert([[tree valueForKey:@"treeCopiedUnits"] unsignedIntegerValue] == copiedBefore);
      waitFor(^bool { return [[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] == tree.lineCount; });
      assert(grammarRequests == 1 && [tree.source isEqualToString:fence]);
      tree.onGrammarRequired = nil;
      [tree configureSyntaxLanguage:@"unsupported-language" theme:@"dark-plus" enabled:YES];
      assert(!syntax::TreeSitterHighlighter::supports("unsupported-language"));
      [tree configureSyntaxLanguage:@"typescript" theme:@"dark-plus" enabled:NO];
      assert([[tree valueForKey:@"treeBusy"] boolValue] == NO);
      std::cout << "Tree-sitter native scheduling: prefix, background, retained colors, undo/IME, themes, Markdown/MDX, loading edits, replacement and unsupported fallback passed\n";
    }
  }
  std::cout << "Source Tree-sitter scheduling passed\n";
}
