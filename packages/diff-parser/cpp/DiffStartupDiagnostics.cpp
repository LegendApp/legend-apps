#include "DiffStartupDiagnostics.hpp"

#include <atomic>
#include <chrono>
#include <cstdio>
#include <sstream>

#if defined(__APPLE__)
#include <os/log.h>
#endif

namespace margelo::nitro::legendapps::diffparser {

namespace {

#if DEBUG
constexpr const char* startupDebugId = "diff-startup-boundaries-v2";
std::atomic<uint64_t> startupSequence{0};

uint64_t epochMilliseconds() {
  return static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::system_clock::now().time_since_epoch()).count());
}

#if defined(__APPLE__)
os_log_t diffStartupLog() {
  static os_log_t log = os_log_create("so.legend.diff.macos", "startup-diagnosis");
  return log;
}
#endif
#endif

} // namespace

void logDiffStartupDiagnostic(const std::string& event, const std::string& payload) {
#if DEBUG
  std::ostringstream message;
  message
      << epochMilliseconds()
      << " [DEBUG " << startupDebugId << "] "
      << event
      << " {\"seq\":" << startupSequence.fetch_add(1) + 1
      << ",\"data\":" << (payload.empty() ? "{}" : payload)
      << "}";
#if defined(__APPLE__)
  os_log_with_type(diffStartupLog(), OS_LOG_TYPE_DEFAULT, "%{public}s", message.str().c_str());
#else
  std::fprintf(stderr, "%s\n", message.str().c_str());
#endif
#else
  (void)event;
  (void)payload;
#endif
}

} // namespace margelo::nitro::legendapps::diffparser
