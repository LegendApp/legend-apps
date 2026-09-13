#include "../cpp/TreeSitterHighlighter.hpp"
#include "../vendor/tree-sitter/Symbols.h"
#include "../vendor/tree-sitter/queries/Highlights.hpp"
#include <chrono>
#include <iostream>

using namespace margelo::nitro::legendapps::syntaxparser;
using Clock = std::chrono::steady_clock;
static double elapsed(Clock::time_point start) {
  return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}
// Run in fresh processes to include compilation performed by pack validation.
// Uses actual pinned fixture queries under a distinct dynamically registered ID.
int main(int argc, char** argv) {
  if (argc != 2) return 2;
  for (const auto& entry : treeSitterLanguages) {
    if (std::string_view(entry.name) != argv[1]) continue;
    const std::string name = std::string("startup-") + entry.name;
    auto start = Clock::now();
    TreeSitterHighlighter::registerPack({1, name.c_str(), entry.scope, entry.query, entry.grammar});
    const auto registration = elapsed(start);
    start = Clock::now();
    TreeSitterHighlighter first(name);
    const auto firstWorker = elapsed(start);
    start = Clock::now();
    for (int i = 0; i < 100; ++i) { TreeSitterHighlighter worker(name); }
    std::cout << "{\"language\":\"" << entry.name << "\",\"register_ms\":" << registration
      << ",\"first_worker_ms\":" << firstWorker << ",\"warm_100_ms\":" << elapsed(start) << "}\n";
    return 0;
  }
  return 2;
}
