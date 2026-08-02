#include "../cpp/ChatDocument.hpp"
#include "../cpp/ChatCatalog.hpp"
#include "../cpp/ChatJson.hpp"
#include "../cpp/HybridChatDocument.hpp"

#include <atomic>
#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <fstream>
#include <stdexcept>
#include <string>
#include <unistd.h>

using namespace margelo::nitro::legendapps::chathistory;

namespace {

void expect(bool condition, const std::string& message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}

std::string decode(const ChatParseResult& result, const std::vector<JsonRange>& ranges) {
  ChatJson json(result.source->data(), result.source->size());
  std::string output;
  for (const JsonRange& range : ranges) {
    if (!output.empty()) {
      output.append("\n\n");
    }
    output.append(json.stringValue(range));
  }
  return output;
}

void testCodex(const std::filesystem::path& fixtureRoot) {
  std::atomic<uint64_t> generation{1};
  ChatParseResult result = parseChatFile("codex", (fixtureRoot / "codex.jsonl").string(), 1, generation);
  expect(result.recordCount == 11, "Codex record count should include the incomplete final record");
  expect(result.rows.size() == 4, "Codex should produce message and generic tool rows");
  expect(result.rows[0].kind == "user", "Codex first row should be user");
  expect(decode(result, result.rows[0].markdownRanges) == "Hello ☺\nworld", "Codex text should decode on demand");
  expect(result.rows[0].hasImagePlaceholder, "Codex image should remain a placeholder");
  expect(result.rows[1].kind == "tool" && result.rows[1].toolName == "read_file", "Codex tool call should normalize");
  expect(result.rows[1].toolStatus == "completed", "Codex tool output should pair with its call");
  expect(decode(result, result.rows[1].previewRanges) == "first line\nsecond line", "Codex tool preview should use canonical output");
  expect(result.rows[2].kind == "tool" && result.rows[2].hasImagePlaceholder, "Codex image generation should use a generic placeholder tool row");
  expect(result.rows[2].toolStatus == "completed", "Codex image result should complete its tool row");
  expect(result.rows[3].kind == "assistant", "Codex final visible row should be assistant");
  expect(result.warningCount == 2, "Codex should warn for unknown relevant and malformed records");
}

void testClaude(const std::filesystem::path& fixtureRoot) {
  std::atomic<uint64_t> generation{1};
  ChatParseResult result = parseChatFile("claude", (fixtureRoot / "claude.jsonl").string(), 1, generation);
  expect(result.recordCount == 8, "Claude record count should include the incomplete final record");
  expect(result.rows.size() == 4, "Claude should produce user, assistant, paired tool, and final assistant rows");
  expect(decode(result, result.rows[0].markdownRanges) == "Start here", "Claude should retain the root user message");
  expect(decode(result, result.rows[1].markdownRanges) == "I will check.", "Claude should omit thinking content");
  expect(result.rows[2].kind == "tool" && result.rows[2].toolStatus == "completed", "Claude tool result should pair");
  expect(decode(result, result.rows[2].previewRanges) == "file contents", "Claude tool preview should be lazy text ranges");
  expect(decode(result, result.rows[3].markdownRanges) == "Latest answer", "Claude should select the latest main chain");
  expect(result.rows[3].hasImagePlaceholder, "Claude embedded image should remain a placeholder");
  expect(result.warningCount == 1, "Claude should warn for the malformed final record");
}

void testCancellation(const std::filesystem::path& fixtureRoot) {
  std::atomic<uint64_t> generation{2};
  bool cancelled = false;
  try {
    static_cast<void>(parseChatFile("codex", (fixtureRoot / "codex.jsonl").string(), 1, generation));
  } catch (const std::runtime_error& error) {
    cancelled = std::string(error.what()) == "Chat open cancelled";
  }
  expect(cancelled, "Parser should observe a superseded open generation");
}

void testDocumentRelease(const std::filesystem::path& fixtureRoot) {
  std::atomic<uint64_t> generation{1};
  ChatParseResult result = parseChatFile("codex", (fixtureRoot / "codex.jsonl").string(), 1, generation);
  const double sourceBytes = static_cast<double>(result.source->size());
  ChatDocumentTiming timing(sourceBytes, 11, 4, 0, 0, 0, 0, 0);
  auto document = std::make_shared<HybridChatDocument>("test", std::move(result), timing);
  ChatDocumentRegistry::shared().registerDocument("test", document);
  expect(document->markdownForRow(0) == "Hello ☺\nworld", "Native provider should decode a visible row");
  expect(document->releaseNativeResources() == sourceBytes, "Release should report unmapped bytes");
  expect(document->releaseNativeResources() == 0, "Release should be idempotent");
  expect(document->markdownForRow(0).empty(), "Released document should not expose source content");
}

void testCatalogIndexes() {
  const std::filesystem::path testHome = std::filesystem::temp_directory_path() /
      ("legend-chat-history-" + std::to_string(getpid()));
  const std::filesystem::path codexRoot = testHome / ".codex" / "sessions";
  const std::filesystem::path claudeRoot = testHome / ".claude" / "projects" / "demo";
  std::filesystem::create_directories(codexRoot);
  std::filesystem::create_directories(claudeRoot);

  const std::string codexId = "11111111-1111-1111-1111-111111111111";
  const std::filesystem::path codexPath = codexRoot / ("rollout-2026-01-01-" + codexId + ".jsonl");
  std::ofstream(codexPath) << "{\"body\":\"must not be read for catalog metadata\"}\n";
  std::ofstream(testHome / ".codex" / "session_index.jsonl")
      << "{\"id\":\"" << codexId
      << "\",\"thread_name\":\"Indexed Codex\",\"updated_at\":\"2026-01-01T10:00:00Z\"}\n";

  const std::string claudeId = "22222222-2222-2222-2222-222222222222";
  const std::filesystem::path claudePath = claudeRoot / (claudeId + ".jsonl");
  std::ofstream(claudePath) << "{\"body\":\"also not catalog data\"}\n";
  std::ofstream(claudeRoot / "sessions-index.json")
      << "{\"version\":1,\"entries\":[{\"sessionId\":\"" << claudeId
      << "\",\"fullPath\":\"" << claudePath.string()
      << "\",\"summary\":\"Indexed Claude\",\"modified\":\"2026-01-02T10:00:00Z\"}]}";

  const char* previousHomeValue = std::getenv("HOME");
  const std::string previousHome = previousHomeValue ? previousHomeValue : "";
  setenv("HOME", testHome.c_str(), 1);
  const std::vector<ChatSummary> summaries = getRecentChatCatalog(20);
  if (previousHomeValue) {
    setenv("HOME", previousHome.c_str(), 1);
  } else {
    unsetenv("HOME");
  }
  std::filesystem::remove_all(testHome);

  expect(summaries.size() == 2, "Catalog should discover both standard provider roots");
  expect(summaries[0].provider == "claude" && summaries[0].title == "Indexed Claude", "Claude index should supply title and recency");
  expect(summaries[1].provider == "codex" && summaries[1].title == "Indexed Codex", "Codex index should supply title and recency");
}

} // namespace

int main(int argc, char** argv) {
  if (argc == 4 && std::string(argv[1]) == "--probe") {
    try {
      std::atomic<uint64_t> generation{1};
      const auto startedAt = std::chrono::steady_clock::now();
      ChatParseResult result = parseChatFile(argv[2], argv[3], 1, generation);
      const double totalMs = std::chrono::duration<double, std::milli>(
          std::chrono::steady_clock::now() - startedAt).count();
      std::cout << "provider=" << argv[2]
                << " bytes=" << result.source->size()
                << " records=" << result.recordCount
                << " rows=" << result.rows.size()
                << " warnings=" << result.warningCount
                << " mapped_ms=" << result.mappedMs
                << " scanned_ms=" << result.scannedMs
                << " normalized_ms=" << result.normalizedMs
                << " total_ms=" << totalMs << '\n';
      return 0;
    } catch (const std::exception& error) {
      std::cerr << error.what() << '\n';
      return 1;
    }
  }
  if (argc != 2) {
    std::cerr << "Expected fixture directory\n";
    return 1;
  }
  try {
    const std::filesystem::path fixtureRoot(argv[1]);
    testCodex(fixtureRoot);
    testClaude(fixtureRoot);
    testCancellation(fixtureRoot);
    testDocumentRelease(fixtureRoot);
    testCatalogIndexes();
    std::cout << "chat history native tests passed\n";
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
  return 0;
}
