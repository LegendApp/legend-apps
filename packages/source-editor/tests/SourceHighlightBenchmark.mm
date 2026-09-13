#import <AppKit/AppKit.h>
#import "../macos/SourceInputView.h"
#include "../cpp/SourceTreeSyntax.hpp"
#include "../cpp/SourceFileReader.hpp"
#include <chrono>
#include <iostream>
#include <sys/resource.h>
#include <unordered_map>
#include "../../syntax-parser/cpp/SyntaxHighlighter.hpp"

using namespace legend::source;
using Clock = std::chrono::steady_clock;
static double ms(Clock::time_point start) { return std::chrono::duration<double, std::milli>(Clock::now() - start).count(); }
static uint64_t digest(uint64_t h, uint64_t value) { return (h ^ value) * 1099511628211ULL; }

@interface LESourceInputView (Benchmark)
- (void)recordStartupDraw;
- (std::vector<margelo::nitro::legendapps::syntaxparser::SyntaxStyle>)resolveTreeStyles:(const std::vector<std::vector<std::string>>&)scopes theme:(NSString *)theme;
@end
@interface BenchmarkInput : LESourceInputView
@end
@implementation BenchmarkInput
- (std::vector<margelo::nitro::legendapps::syntaxparser::SyntaxStyle>)resolveTreeStyles:(const std::vector<std::vector<std::string>>&)scopes theme:(NSString *)theme {
  std::vector<margelo::nitro::legendapps::syntaxparser::SyntaxStyle> styles;
  for (size_t i = 0; i < scopes.size(); ++i) styles.emplace_back(i, "#eeeeee", 0);
  return styles;
}
@end

// Native harness: optimized C++ and the actual AppKit scheduler, without Metro,
// downloads, drawing or file-dialog costs. No fixture is written to disk.
int main(int argc, char **argv) { @autoreleasepool {
  if (argc != 4) { std::cerr << "usage: benchmark file|synthetic language scheduler|roundtrip|worker|4096|whole\n"; return 2; }
  [NSApplication sharedApplication];
  std::u16string source;
  size_t bytes = 0;
  if (std::string(argv[1]) == "synthetic") {
    // Unique bindings plus references stress query predicates, not just parsing.
    for (size_t i = 0; source.size() < 10 * 1024 * 1024; ++i) {
      auto line = "export const value" + std::to_string(i) + " = Math.max(" + std::to_string(i) + ", 42);\n";
      source.append(line.begin(), line.end());
    }
    bytes = source.size();
  } else {
    SourceFileReader reader(argv[1]);
    while (!reader.done()) source += reader.next(1048576, SIZE_MAX);
    bytes = reader.bytesRead();
  }
  const std::string mode = argv[3];
  if (mode == "scheduler") {
    auto *input = [[BenchmarkInput alloc] initWithFrame:NSMakeRect(0, 0, 900, 600)];
    input.syntaxHighlightingInBackground = YES;
    __block bool failed = false;
    input.onSyntaxError = ^(NSString *error) { if (error.length) { std::cerr << error.UTF8String << '\n'; failed = true; } };
    const auto start = Clock::now();
    [input loadSource:[[NSString alloc] initWithCharacters:(const unichar *)source.data() length:source.size()]];
    [input configureSyntaxLanguage:[NSString stringWithUTF8String:argv[2]] theme:@"dark-plus" enabled:YES];
    [input recordStartupDraw];
    while (!failed && [[input valueForKey:@"treeNextLine"] unsignedIntegerValue] < input.lineCount) {
      [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.001]];
      if (ms(start) > 180000) { std::cerr << "scheduler timeout\n"; return 3; }
    }
    std::cout << "{\"mode\":\"scheduler\",\"bytes\":" << bytes << ",\"total_ms\":" << ms(start) << "}\n";
    return failed ? 1 : 0;
  }
  SourceTreeSyntax worker(argv[2]);
  auto start = Clock::now();
  for (size_t offset = 0; offset < source.size(); offset += 262144) worker.replace(offset, 0, source.substr(offset, 262144));
  const auto mirror = ms(start); start = Clock::now();
  if (!worker.parse()) return 1;
  const auto parse = ms(start);
  auto queue = dispatch_queue_create("legend.highlight.benchmark", dispatch_queue_attr_make_with_qos_class(DISPATCH_QUEUE_SERIAL, QOS_CLASS_USER_INITIATED, 0));
  __block bool done = false;
  __block size_t next = 0, tokens = 0, batches = 0;
  __block double work = 0, publish = 0, maximumBatch = 0;
  __block uint64_t hash = 1469598103934665603ULL;
  std::unordered_map<size_t, std::vector<SourceSyntaxToken>> retained;
  auto *cache = &retained;
  auto *parser = &worker;
  const auto batch = mode == "whole" ? worker.lineCount() : mode == "4096" ? 4096 : 512;
  void (^consume)(std::vector<SourceSyntaxRow>) = ^(std::vector<SourceSyntaxRow> rows) {
    auto began = Clock::now();
    for (auto& row : rows) {
      hash = digest(hash, row.index);
      for (const auto& token : row.tokens) { hash = digest(digest(digest(hash, token.start), token.length), token.capture); ++tokens; }
      (*cache)[row.index] = std::move(row.tokens);
    }
    publish += ms(began);
  };
  __block void (^step)(void);
  step = ^{
    auto began = Clock::now();
    auto rows = parser->highlight(next, batch);
    const auto elapsed = ms(began); work += elapsed; maximumBatch = std::max(maximumBatch, elapsed); ++batches;
    next += rows.size();
    if (mode == "roundtrip") {
      dispatch_async(dispatch_get_main_queue(), ^{
        consume(rows);
        if (next == parser->lineCount()) done = true;
        else dispatch_async(dispatch_get_main_queue(), ^{ dispatch_async(queue, step); });
      });
    } else { consume(std::move(rows)); if (next == parser->lineCount()) done = true; }
  };
  start = Clock::now();
  if (mode == "roundtrip") {
    dispatch_async(queue, step);
    while (!done) [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.001]];
  } else {
    // Worker-owned cache and continuation: the main run loop stays available,
    // and queued worker requests can run between cooperative 8 ms slices.
    std::atomic_bool complete{false}; auto *completion = &complete;
    __block void (^pump)(void);
    pump = ^{
      const auto began = Clock::now();
      do { step(); } while (!done && ms(began) < 8);
      if (done) completion->store(true, std::memory_order_release);
      else dispatch_async(queue, pump);
    };
    dispatch_async(queue, pump);
    while (!complete.load(std::memory_order_acquire)) [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.001]];
    pump = nil;
  }
  const auto total = ms(start); step = nil;
  rusage usage{}; getrusage(RUSAGE_SELF, &usage);
  std::cout << "{\"mode\":\"" << mode << "\",\"bytes\":" << bytes << ",\"lines\":" << worker.lineCount()
    << ",\"mirror_ms\":" << mirror << ",\"parse_ms\":" << parse << ",\"highlight_ms\":" << total
    << ",\"query_rows_ms\":" << work << ",\"publish_ms\":" << publish << ",\"max_batch_ms\":" << maximumBatch
    << ",\"batches\":" << batches << ",\"tokens\":" << tokens << ",\"hash\":\"" << hash
    << "\",\"peak_bytes\":" << usage.ru_maxrss << "}\n";
} }
