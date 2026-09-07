#include "../cpp/ChatCatalog.hpp"
#include "../cpp/ChatDocument.hpp"
#include "../cpp/HybridChatDocument.hpp"

#include <atomic>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <unistd.h>

using namespace margelo::nitro::legendapps::chathistory;

namespace {

void require(bool condition, const char* message) {
  if (!condition) throw std::runtime_error(message);
}

ChatParseResult parseFixture(const std::string& contents) {
  static size_t sequence = 0;
  const auto path = std::filesystem::temp_directory_path() /
      ("legend-chat-schema-" + std::to_string(getpid()) + "-" + std::to_string(sequence++) + ".jsonl");
  {
    std::ofstream output(path);
    output << contents;
  }
  std::atomic<uint64_t> generation{1};
  try {
    auto result = parseChatFile("codex", path.string(), 1, generation);
    std::filesystem::remove(path);
    return result;
  } catch (...) {
    std::filesystem::remove(path);
    throw;
  }
}

std::string envelope(const std::string& payload, const std::string& extra = "") {
  return "{\"timestamp\":\"2026-01-01T00:00:00Z\"," + extra +
      "\"type\":\"event_msg\",\"payload\":" + payload + "}\n";
}

std::string digest(ChatParseResult result) {
  HybridChatDocument document("schema-test", std::move(result), ChatDocumentTiming(0, 0, 0, 0, 0, 0, 0, 0));
  return document.getContentDigest();
}

bool reportAudit(const std::string& id, const ChatParseResult& result, std::ostream& output) {
  output << "chat=" << id << " bytes=" << result.source->size()
         << " records=" << result.recordCount
         << " fast=" << result.codexFastPathRecords
         << " fallback=" << result.codexFallbackRecords
         << " fallback_bytes=" << result.codexFallbackBytes
         << " warnings=" << result.warningCount
         << " normalize_ms=" << result.normalizedMs << '\n';
  return result.codexFallbackRecords == 0;
}

} // namespace

void testCodexEnvelopeSchemas(const std::filesystem::path& fixtureRoot) {
  // Exercise full tool pairing, files, timestamps and images from the existing
  // canonical fixtures under both envelope versions, not just message text.
  for (const auto& name : {"codex.jsonl", "codex-response-user.jsonl"}) {
    std::ifstream input(fixtureRoot / name);
    require(input.good(), "Canonical Codex fixture must be available");
    std::string oldSource;
    std::string ordinalSource;
    std::string line;
    while (std::getline(input, line)) {
      oldSource += line + "\n";
      const auto type = line.find(",\"type\":");
      if (type != std::string::npos) line.insert(type + 1, "\"ordinal\":1,");
      ordinalSource += line + "\n";
    }
    auto oldFixture = parseFixture(oldSource);
    auto ordinalFixture = parseFixture(ordinalSource);
    require(oldFixture.codexFastPathRecords == ordinalFixture.codexFastPathRecords &&
        oldFixture.codexFallbackRecords == ordinalFixture.codexFallbackRecords &&
        oldFixture.warningCount == ordinalFixture.warningCount,
        "Ordinal versions of canonical fixtures must retain path and warning behavior");
    require(digest(std::move(oldFixture)) == digest(std::move(ordinalFixture)),
        "Ordinal versions must preserve canonical fixture content");
  }
  const std::string message = R"({"type":"user_message","message":"Hello \"quoted\" \\ path\nworld 😀","images":[],"local_images":[]})";
  const std::string oldRecord = envelope(message);
  const std::string newRecord = envelope(message, "\"ordinal\":42,");
  auto oldResult = parseFixture(oldRecord);
  auto newResult = parseFixture(newRecord);
  require(oldResult.codexFastPathRecords == 1 && oldResult.codexFallbackRecords == 0,
      "Old Codex envelope must stay on the fast path");
  require(newResult.codexFastPathRecords == 1 && newResult.codexFallbackRecords == 0,
      "Ordinal Codex envelope must stay on the fast path");
  require(oldResult.warningCount == 0 && newResult.warningCount == 0,
      "Supported envelopes should parse without warnings");
  require(digest(std::move(oldResult)) == digest(std::move(newResult)),
      "Ordinal metadata must not change displayed content");

  // Unknown and reordered fields remain supported, but must be visible to the audit.
  const std::string futureRecord = envelope(message, "\"future_sequence\":42,");
  const std::string reorderedRecord = "{\"payload\":" + message +
      ",\"type\":\"event_msg\",\"timestamp\":\"2026-01-01T00:00:00Z\"}\n";
  for (const auto& record : {futureRecord, reorderedRecord}) {
    auto result = parseFixture(record);
    require(result.codexFastPathRecords == 0 && result.codexFallbackRecords == 1,
        "Schema drift must increment fallback diagnostics");
    require(result.codexFallbackBytes == record.size() - 1,
        "Fallback bytes must measure the actual affected record, excluding newline");
    std::ostringstream output;
    require(!reportAudit("fixture", result, output), "Recent audit must fail on schema drift");
    require(output.str().find("Hello") == std::string::npos, "Audit must not print message text");
    require(digest(std::move(result)) == digest(parseFixture(oldRecord)),
        "Fallback must preserve visible content for reordered or unknown fields");
  }

  // Structural assertions avoid machine-dependent timing thresholds. A schema
  // regression must fail even if the ignored payload happens to be small/cached.
  const std::string largeIgnored = "{\"type\":\"item_completed\",\"item\":\"" +
      std::string(1024 * 1024, 'x') + "\"}";
  auto mixed = parseFixture(oldRecord + newRecord + envelope(largeIgnored, "\"ordinal\":43,"));
  require(mixed.codexFastPathRecords == 3 && mixed.codexFallbackBytes == 0,
      "Mixed old/new records and large ignored events must avoid fallback traversal");
  require(mixed.rows.size() == 2, "Ignored event payloads must not produce rows");
  std::ostringstream report;
  require(reportAudit("fixture", mixed, report), "Audit must accept known schemas");

  // Existing shallow semantics: inspect consumed fields, not ignored subtrees.
  // Explicitly require the same behavior with and without ordinal.
  const std::string invalidIgnored = "{\"type\":\"item_completed\",\"unused\":\"bad" +
      std::string(1, '\x01') + "\"}";
  for (const auto& extra : {std::string(), std::string("\"ordinal\":1,")}) {
    auto ignored = parseFixture(envelope(invalidIgnored, extra));
    require(ignored.codexFastPathRecords == 1 && ignored.warningCount == 0 && ignored.rows.empty(),
        "Known envelopes intentionally do not validate ignored payload contents");
    auto invalidMessage = parseFixture(envelope("{\"type\":\"user_message\",\"message\":\"bad" +
        std::string(1, '\x01') + "\"}", extra));
    require(invalidMessage.warningCount == 1 && invalidMessage.rows.empty(),
        "Malformed consumed message text must still warn and stay hidden");
    auto truncated = parseFixture(envelope(message, extra).substr(0, 50));
    require(truncated.warningCount == 1 && truncated.rows.empty(),
        "Truncated records must still warn without producing content");
  }
  auto malformedOrdinal = parseFixture(envelope(message, "\"ordinal\":[1,,2],"));
  require(malformedOrdinal.codexFallbackRecords == 1 && malformedOrdinal.warningCount == 1,
      "Malformed envelope metadata must fall back and report a warning");
}

int auditRecentChats(size_t limit) {
  const auto chats = getRecentChatCatalog(limit);
  size_t audited = 0;
  size_t failed = 0;
  std::atomic<uint64_t> generation{1};
  for (const auto& chat : chats) {
    if (chat.provider != "codex") continue; // Claude has a different, deliberate parser path.
    audited += 1;
    try {
      const auto result = parseChatFile("codex", chat.path, 1, generation);
      if (!reportAudit(chat.id, result, std::cout)) failed += 1;
    } catch (...) {
      // Exceptions can contain source paths; print identity only in the audit.
      std::cerr << "chat=" << chat.id << " parse_failed=1\n";
      failed += 1;
    }
  }
  std::cout << "recent_codex_chats=" << audited << " unexpected_fallback_or_error=" << failed << '\n';
  if (audited == 0) std::cout << "SKIP: no Codex chats in the requested recent catalog window\n";
  return failed == 0 ? 0 : 1;
}
