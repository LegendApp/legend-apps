#include "../cpp/SourceTreeSyntax.hpp"
#include "../cpp/SourceFileReader.hpp"
#include <chrono>
#include <iostream>
#include <sys/resource.h>
using namespace legend::source;
int main(int argc, char** argv) {
  if (argc != 3) return 2;
  SourceFileReader file(argv[1]); std::u16string source;
  while (!file.done()) source += file.next();
  SourceTreeSyntax worker(argv[2]); worker.replace(0, 0, source); worker.parse();
  for (int pass = 0; pass < 3; ++pass) {
    uint64_t hash = 1469598103934665603ULL;
    const auto start = std::chrono::steady_clock::now();
    for (size_t line = 0; line < worker.lineCount(); line += 512) {
      for (const auto& row : worker.highlight(line, 512)) {
        hash = (hash ^ row.index) * 1099511628211ULL;
        for (const auto& token : row.tokens) for (auto value : {token.start, token.length, token.capture})
          hash = (hash ^ value) * 1099511628211ULL;
      }
    }
    const auto ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count();
    rusage usage{}; getrusage(RUSAGE_SELF, &usage);
    // ru_maxrss is bytes on macOS, KiB on Linux. Keep the native unit explicit.
    std::cout << "{\"pass\":" << pass << ",\"highlight_ms\":" << ms
      << ",\"hash\":\"" << hash << "\",\"ru_maxrss\":" << usage.ru_maxrss << "}\n";
  }
}
