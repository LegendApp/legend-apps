#include "../cpp/ChatStartupLoad.hpp"
#include "../cpp/HybridChatHistory.hpp"
#include "../cpp/ChatDocument.hpp"
#include "../cpp/ChatCatalog.hpp"
#include "../cpp/ChatJson.hpp"
#include "../cpp/ChatTime.hpp"
#include "../cpp/HybridChatDocument.hpp"

#include <algorithm>
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

void testCodexEnvelopeSchemas(const std::filesystem::path& fixtureRoot);
int auditRecentChats(size_t limit);

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
  expect(result.recordCount == 14, "Codex record count should include compacted and incomplete records");
  expect(result.rows.size() == 5, "Codex should produce message, tool, and file rows");
  expect(result.rows[0].kind == "user", "Codex first row should be user");
  expect(
      decode(result, result.rows[0].markdownRanges).find("<skill>injected context</skill>") == std::string::npos,
      "Codex should use canonical user events and exclude injected response-item context");
  expect(
      result.rows[0].imageSources == std::vector<std::string>{"/tmp/image.png"}
          && !result.rows[0].hasImagePlaceholder,
      "Codex local images should remain addressable instead of becoming placeholders");
  expect(result.rows[1].kind == "tool" && result.rows[1].toolName == "read_file", "Codex tool call should normalize");
  expect(result.rows[1].toolStatus == "completed", "Codex tool output should pair with its call");
  expect(decode(result, result.rows[1].previewRanges) == "first line\nsecond line", "Codex tool preview should use canonical output");
  expect(result.rows[2].kind == "tool" && result.rows[2].hasImagePlaceholder, "Codex image generation should use a generic placeholder tool row");
  expect(result.rows[2].toolStatus == "completed", "Codex image result should complete its tool row");
  expect(result.rows[3].kind == "assistant", "Codex final visible row should be assistant");
  expect(result.rows[4].kind == "files", "Codex patch events should follow the assistant as one file row");
  expect(result.rows[4].fileChanges.size() == 3, "Codex repeated patches should merge by file");
  expect(
      result.rows[4].fileChanges[0].path == "apps/demo.ts"
          && result.rows[4].fileChanges[0].additions == 3
          && result.rows[4].fileChanges[0].deletions == 2,
      "Codex should aggregate line totals and make paths relative to the turn cwd");
  expect(result.warningCount == 2, "Codex should warn for unknown relevant and malformed records");

  ChatDocumentTiming timing(static_cast<double>(result.source->size()), 14, 4, 0, 0, 0, 0, 0);
  auto document = std::make_shared<HybridChatDocument>("codex-group", std::move(result), timing);
  expect(document->getContentDigest() == "ea203684aeae72fb", "Codex display rows should have the canonical content digest");
  expect(document->getRowCount() == 4, "Codex adjacent tools should collapse without hiding file changes");
  expect(
      document->getRowKind(0) == "user" && document->getRowKind(1) == "tool",
      "Display row kinds should be available without constructing full metadata");
  const ChatRowMetadata userMetadata = document->getRowMetadata(0);
  expect(
      userMetadata.imageCount == 1
          && document->getImageSource(0, 0) == "/tmp/image.png"
          && document->markdownForRow(0) == "Hello ☺\nworld\n",
      "Codex attachment wrappers should become an indexed image and the visible request");
  const ChatRowMetadata metadata = document->getRowMetadata(1);
  expect(metadata.kind == "tool" && metadata.toolName == "Worked for 4s", "Codex work row should expose its duration");
  expect(
      document->getToolPreview(1, 64 * 1024) == "Read files, created an image",
      "Codex work row should expand to a plain-text activity summary");
  expect(
      document->markdownForRow(2) == "Done **quickly**.\n\n```text\n::git-commit{example}\n```",
      "Codex assistant rows should hide application metadata without altering fenced examples");
  const ChatRowMetadata fileMetadata = document->getRowMetadata(3);
  expect(
      fileMetadata.kind == "files"
          && fileMetadata.fileCount == 3
          && fileMetadata.fileAdditions == 4
          && fileMetadata.fileDeletions == 4,
      "Codex file row should expose its aggregate summary");
  const ChatFileChange firstFile = document->getFileChange(3, 0);
  expect(
      firstFile.path == "apps/demo.ts" && firstFile.additions == 3 && firstFile.deletions == 2,
      "Codex file entries should remain index-addressable from native storage");
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

  ChatDocumentTiming timing(static_cast<double>(result.source->size()), 8, 3, 0, 0, 0, 0, 0);
  auto document = std::make_shared<HybridChatDocument>("claude-group", std::move(result), timing);
  expect(document->getContentDigest() == "4cb20d4c68d78408", "Claude display rows should have the canonical content digest");
  expect(document->getRowCount() == 3, "Claude progress text and tools should collapse into one display row");
  const ChatRowMetadata metadata = document->getRowMetadata(1);
  expect(metadata.kind == "tool" && metadata.toolName == "Worked for 3s", "Claude work row should expose its duration");
  expect(
      document->getToolPreview(1, 64 * 1024) == "I will check.\n\nRead files",
      "Claude work row should expand to progress text and a plain-text activity summary");
}

void testCurrentCodexUserMessages(const std::filesystem::path& fixtureRoot) {
  std::atomic<uint64_t> generation{1};
  ChatParseResult result = parseChatFile(
      "codex",
      (fixtureRoot / "codex-response-user.jsonl").string(),
      1,
      generation);
  expect(result.rows.size() == 2, "Current Codex response messages should produce both visible turns");
  expect(result.rows[0].kind == "user", "Current Codex response user message should remain visible");
  expect(
      decode(result, result.rows[0].markdownRanges) == "Current-format request",
      "Current Codex response user text should remain lazy source ranges");
  expect(result.rows[1].kind == "assistant", "Current Codex assistant message should follow its user turn");
}

void testArrayToolOutputIsShallow() {
  const std::string malformed = "{\"before\":1,\"output\":[\"unterminated]}";
  const ChatJson malformedJson(malformed.data(), malformed.size());
  const auto malformedRoot = malformedJson.topLevelObject(0, malformed.size());
  expect(malformedRoot.has_value(), "Shallow object discovery should accept a bounded object range");
  expect(
      malformedJson.memberKind(*malformedRoot, "output") == JsonValueKind::Array,
      "Member kind lookup should not traverse a matching array value");
  expect(
      !malformedJson.member(*malformedRoot, "output").has_value(),
      "Full member lookup should continue validating the matching value");

  const std::filesystem::path path = std::filesystem::temp_directory_path() /
      ("legend-chat-history-array-output-" + std::to_string(getpid()) + ".jsonl");
  {
    std::ofstream output(path);
    output
        << "{\"timestamp\":\"2026-01-01T00:00:00.000Z\",\"type\":\"response_item\","
           "\"payload\":{\"type\":\"custom_tool_call\",\"call_id\":\"image-call\","
           "\"name\":\"capture_screen\",\"input\":\"{}\"}}\n"
        << "{\"timestamp\":\"2026-01-01T00:00:01.000Z\",\"type\":\"response_item\","
           "\"payload\":{\"type\":\"custom_tool_call_output\",\"call_id\":\"image-call\","
           "\"output\":[{\"type\":\"input_text\",\"text\":\"captured\"},"
           "{\"type\":\"input_image\",\"image_url\":\"data:image/png;base64,omitted\"}]}}\n";
  }
  std::atomic<uint64_t> generation{1};
  ChatParseResult result = parseChatFile("codex", path.string(), 1, generation);
  std::filesystem::remove(path);
  expect(result.rows.size() == 1, "Array tool output should remain paired with its call");
  expect(result.rows[0].toolStatus == "completed", "Array tool output should complete its tool row");
  expect(
      decode(result, result.rows[0].previewRanges) == "{}",
      "Array tool output should preserve the call preview without decoding embedded image data");
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

void testIsoTimestamps() {
  expect(
      parseIsoTimestampMilliseconds("1970-01-01T00:00:00Z") == 0,
      "Unix epoch should parse without locale or timezone APIs");
  expect(
      parseIsoTimestampMilliseconds("2026-01-02T03:04:05.678Z") == 1767323045678.0,
      "ISO timestamps should retain millisecond precision");
  expect(
      parseIsoTimestampMilliseconds("2024-02-29T00:00:00Z") == 1709164800000.0,
      "ISO timestamps should accept leap days");
  expect(
      parseIsoTimestampMilliseconds("2025-02-29T00:00:00Z") == 0,
      "ISO timestamps should reject invalid calendar dates");
}

void testDocumentRelease(const std::filesystem::path& fixtureRoot) {
  std::atomic<uint64_t> generation{1};
  ChatParseResult result = parseChatFile("codex", (fixtureRoot / "codex.jsonl").string(), 1, generation);
  const double sourceBytes = static_cast<double>(result.source->size());
  ChatDocumentTiming timing(sourceBytes, 14, 5, 0, 0, 0, 0, 0);
  auto document = std::make_shared<HybridChatDocument>("test", std::move(result), timing);
  ChatDocumentRegistry::shared().registerDocument("test", document);
  expect(document->markdownForRow(0) == "Hello ☺\nworld\n", "Native provider should decode a visible row");
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

  const std::string unindexedId = "33333333-3333-3333-3333-333333333333";
  const std::filesystem::path unindexedPath = codexRoot / ("rollout-2026-01-03-" + unindexedId + ".jsonl");
  std::ofstream(unindexedPath)
      << "{\"type\":\"session_meta\",\"payload\":{\"id\":\"" << unindexedId
      << "\",\"source\":\"cli\"}}\n";

  const std::string subagentId = "44444444-4444-4444-4444-444444444444";
  const std::filesystem::path subagentPath = codexRoot / ("rollout-2026-01-04-" + subagentId + ".jsonl");
  std::ofstream(subagentPath)
      << "{\"type\":\"session_meta\",\"payload\":{\"id\":\"" << subagentId
      << "\",\"source\":{\"subagent\":{\"thread_spawn\":{\"parent_thread_id\":\""
      << codexId << "\"}}}}}\n";

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
  const std::vector<ChatSummary> limitedSummaries = getRecentChatCatalog(2);
  if (previousHomeValue) {
    setenv("HOME", previousHome.c_str(), 1);
  } else {
    unsetenv("HOME");
  }
  std::filesystem::remove_all(testHome);

  expect(summaries.size() == 3, "Catalog should include indexed and unindexed top-level sessions");
  expect(
      std::none_of(summaries.begin(), summaries.end(), [&](const ChatSummary& summary) {
        return summary.id == "codex:" + subagentId;
      }),
      "Catalog should exclude Codex subagent transcripts");
  expect(
      std::any_of(summaries.begin(), summaries.end(), [&](const ChatSummary& summary) {
        return summary.id == "codex:" + unindexedId && summary.title.starts_with("Codex chat — ");
      }),
      "Catalog should preserve legitimate unindexed Codex sessions with fallback titles");
  expect(
      std::any_of(summaries.begin(), summaries.end(), [](const ChatSummary& summary) {
        return summary.provider == "codex" && summary.title == "Indexed Codex";
      })
          && std::any_of(summaries.begin(), summaries.end(), [](const ChatSummary& summary) {
            return summary.provider == "claude" && summary.title == "Indexed Claude";
          }),
      "Catalog should retain provider index titles");
  expect(
      limitedSummaries.size() == 2
          && std::none_of(limitedSummaries.begin(), limitedSummaries.end(), [&](const ChatSummary& summary) {
            return summary.id == "codex:" + subagentId;
          }),
      "Catalog should skip subagents while filling the requested visible limit");
}

void testCodexProtocolTitles() {
  namespace fs = std::filesystem;
  const auto home = fs::temp_directory_path() / ("legend-codex-titles-" + std::to_string(getpid()));
  const auto codex = home / "custom-codex";
  const auto bin = home / ".local/bin";
  fs::create_directories(codex / "sessions");
  fs::create_directories(codex / "archived_sessions");
  fs::create_directories(bin);
  fs::create_directory_symlink(codex, home / ".codex");
  const std::vector<std::string> ids = {
      "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222",
      "33333333-3333-3333-3333-333333333333", "44444444-4444-4444-4444-444444444444"};
  for (size_t i = 0; i < ids.size(); ++i) {
    std::ofstream(codex / (i == 3 ? "archived_sessions" : "sessions") / ("rollout-" + ids[i] + ".jsonl"))
        << "{\"type\":\"session_meta\",\"payload\":{\"source\":\"cli\"}}\n";
  }
  std::ofstream(codex / "session_index.jsonl")
      << "{\"id\":\"" << ids[0] << "\",\"thread_name\":\"JOB_DIR=/tmp/fictional explicit name\"}\n"
      << "{\"id\":\"" << ids[1] << "\",\"thread_name\":\"Stale name\"}\n";
  const std::vector<std::string> keys = {"HOME", "CODEX_HOME", "PATH"};
  std::vector<std::optional<std::string>> saved;
  for (const auto& key : keys) {
    const char* value = std::getenv(key.c_str());
    saved.push_back(value ? std::optional<std::string>(value) : std::nullopt);
  }
  setenv("HOME", home.c_str(), 1);
  setenv("CODEX_HOME", codex.c_str(), 1);
  setenv("PATH", "/usr/bin:/bin", 1); // GUI discovery must find ~/.local/bin/codex.
  auto title = [&](const std::vector<ChatSummary>& rows, size_t i) {
    const auto found = std::find_if(rows.begin(), rows.end(), [&](const auto& row) { return row.id == "codex:" + ids[i]; });
    expect(found != rows.end(), "Protocol fixture should retain every local session");
    return found->title;
  };
  auto stub = [&](const std::string& responses) {
    std::ofstream(bin / "codex") << "#!/bin/sh\nn=0\nwhile IFS= read -r line; do\n"
        << "case \"$line\" in *'\"method\":\"initialized\"'*) continue;; esac\n"
        << "n=$((n+1))\necho \"$line\" >> \"$CODEX_HOME/calls\"\ncase $n in\n"
        << "1) printf '%s\\n' '{\"id\":1,\"result\":{}}';;\n" << responses << "\nesac\ndone\n";
    fs::permissions(bin / "codex", fs::perms::owner_all);
  };
  const std::vector<std::pair<std::string, std::string>> requests = {
      {"JOB_DIR=/tmp/fictional/job\nContinuation of the worker audit.\nConstraints: read only.\nGoal: Check keyboard focus\n1. Open the screen", "Check keyboard focus"},
      {"Repo: /tmp/fictional/repo\nIndependent worker review.\nContext: previous checks passed.\nUser: \"Repair export sorting\"\nTask: Run focused tests", "Repair export sorting"},
      {"Repo: /tmp/fictional/repo\nGoal: Land the search fix\nSteps:\n1. Fetch changes", "Land the search fix"},
      {"JOB_DIR=/tmp/fictional/job\nWorker continuation without a goal\n1. Inspect the source", "Worker continuation without a goal"},
      {"Repo: /tmp/fictional/repo\nSteps:\n1. Inspect the source", "1. Inspect the source"},
      {"Note: keep the current behavior\nTask: This is supporting detail", "Note: keep the current behavior"},
      {"Bug: the search is empty", "Bug: the search is empty"},
      {"# Worker instructions\nReview the current implementation\nRequest: Improve keyboard navigation", "Improve keyboard navigation"},
      {"Note: /tmp/fictional is the failing directory", "Note: /tmp/fictional is the failing directory"},
      {"Fix: \"Save\" fails", "Fix: \"Save\" fails"},
      {"\"Fix the title\"", "\"Fix the title\""},
      {"Jay: \"Verify the titles\"", "Verify the titles"},
      {"Jay: “Fix it”", "Fix it"},
      {"User: \"Fix the \"Save\" button's label\"", "Fix the \"Save\" button's label"},
      {"Steps:\nRepair the search", "Repair the search"},
      {"Task: run the build", "run the build"},
      {"Fix: the crash in x", "Fix: the crash in x"},
      {"Jay: \"Verify the titles", "Verify the titles"},
      {"“Fix the title", "“Fix the title"},
      {"JOB_DIR=/tmp/fictional/job\nCONFIG=/tmp/fictional/config\nFix the search results", "Fix the search results"},
      {"Repo: /tmp/fictional/repo (branch main, shared)\nRepair keyboard navigation", "Repair keyboard navigation"},
      {"# Tooling job\n<instructions>\nUse the configured tools.\n</instructions>\nWORK_DIR=/tmp/fictional\n\nAdd export support", "Add export support"},
      {"Source-only landing. Shared checkout: /tmp/fictional/repo\nImprove the empty state", "Improve the empty state"},
      {"  Explain the rendering bug  \nMore details", "Explain the rendering bug"},
      {"Explain how Repo handles /tmp/fictional paths", "Explain how Repo handles /tmp/fictional paths"},
      {"Repo is mentioned in this sentence", "Repo is mentioned in this sentence"},
      {"Explain Repo: /tmp/fictional and its layout", "Explain Repo: /tmp/fictional and its layout"},
      {"[File: /tmp/fictional/image.png]", "[File: /tmp/fictional/image.png]"},
      {"# AGENTS.md instructions for /tmp/fictional\n<INSTRUCTIONS>\nFollow local conventions.\n</INSTRUCTIONS>\n<environment_context>\nDirectory: /tmp/fictional\n</environment_context>", ""},
  };
  for (const auto& [request, expected] : requests) {
    // Encode fictional text for both JSONL sessions and the shell protocol stub.
    std::string encoded;
    for (char c : request) {
      if (c == '\n') encoded += "\\n";
      else if (c == '"' || c == '\\') { encoded += '\\'; encoded += c; }
      else encoded += c;
    }
    std::string shellEncoded;
    for (char c : encoded) {
      shellEncoded += c == '\'' ? "'\\''" : std::string(1, c);
    }
    const auto session = codex / "sessions" / ("rollout-" + ids[2] + ".jsonl");
    std::ofstream(session) << "{\"type\":\"session_meta\",\"payload\":{\"source\":\"cli\"}}\n";
    stub("2) printf '%s\\n' '{\"id\":2,\"result\":{\"data\":[{\"id\":\"" + ids[2]
        + "\",\"preview\":\"" + shellEncoded + "\"}],\"nextCursor\":null}}';;\n"
        "3) printf '%s\\n' '{\"id\":3,\"result\":{\"data\":[],\"nextCursor\":null}}';;");
    const auto protocol = title(getRecentChatCatalog(20), 2);
    expect(expected.empty() ? protocol.starts_with("Codex chat — ") : protocol == expected,
        "Protocol preview should derive task text: " + expected + " (got " + protocol + ")");
    std::ofstream(bin / "codex") << "#!/bin/sh\nexit 1\n";
    std::ofstream(session) << "{\"type\":\"event_msg\",\"payload\":{\"type\":\"user_message\",\"message\":\"" << encoded << "\"}}\n";
    const auto local = title(getRecentChatCatalog(20), 2);
    expect(expected.empty() ? local.starts_with("Codex chat — ") : local == expected,
        "Local first user request should derive task text: " + expected);
    std::ofstream(session) << "{\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"user\",\"content\":[{\"type\":\"input_text\",\"text\":\"" << encoded << "\"}]}}\n";
    const auto response = title(getRecentChatCatalog(20), 2);
    expect(expected.empty() ? response.starts_with("Codex chat — ") : response == expected,
        "Local response-item request should derive task text: " + expected);
  }
  std::ofstream(codex / "sessions" / ("rollout-" + ids[2] + ".jsonl"))
      << "{\"type\":\"event_msg\",\"payload\":{\"type\":\"user_message\",\"message\":\"Repo: /tmp/fictional\\nWorker review\\nGoal: Repair export sorting\"}}\n";
  stub("2) printf '%s\\n' '{\"id\":2,\"result\":{\"data\":[{\"id\":\"" + ids[2]
      + "\",\"preview\":\"Repo: /tmp/fictional\\nWorker review\"}],\"nextCursor\":null}}';;\n"
      "3) printf '%s\\n' '{\"id\":3,\"result\":{\"data\":[],\"nextCursor\":null}}';;");
  expect(title(getRecentChatCatalog(20), 2) == "Repair export sorting",
      "A shortened protocol preview must not replace the full local task");
  std::ofstream(codex / "sessions" / ("rollout-" + ids[2] + ".jsonl"))
      << "{\"type\":\"session_meta\",\"payload\":{\"source\":\"cli\"}}\n";
  fs::remove(codex / "calls");
  stub("2) printf '%s\\n' '{\"id\":2,\"result\":{\"data\":[{\"id\":\"" + ids[0]
      + "\",\"name\":null,\"preview\":\"Must not replace indexed name\"},{\"id\":\"" + ids[1]
      + "\",\"name\":\"Repo: /tmp/fictional xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\",\"preview\":\"Ignore excerpt\"}],\"nextCursor\":\"page\\\"two\"}}';;\n"
      + "3) case \"$line\" in *'page\\\"two'*) ;; *) exit 2;; esac\n"
      + "printf '%s\\n' '{\"id\":3,\"result\":{\"data\":[{\"id\":\"" + ids[2]
      + "\",\"preview\":\"Derived user request\"}],\"nextCursor\":null}}';;\n"
      + "4) case \"$line\" in *'\"archived\":true'*) ;; *) exit 3;; esac\n"
      + "printf '%s\\n' '{\"id\":4,\"result\":{\"data\":[{\"id\":\"" + ids[3]
      + "\",\"name\":\"Archived explicit\"}],\"nextCursor\":null}}';;");
  const auto rows = getRecentChatCatalog(20);
  expect(title(rows, 0) == "JOB_DIR=/tmp/fictional explicit name", "Indexed name must outrank protocol preview");
  expect(title(rows, 2) == "Derived user request", "Missing index title must use protocol preview verbatim across pages");
  expect(title(rows, 1) == "Repo: /tmp/fictional xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "Protocol explicit name must outrank legacy name");
  expect(title(rows, 3) == "Archived explicit", "Archived threads must receive protocol names");
  std::ifstream calls(codex / "calls");
  size_t callCount = 0;
  for (std::string line; std::getline(calls, line);) ++callCount;
  expect(callCount == 4, "One app-server must batch both active pages and archived metadata");
  stub("2) printf '%s\\n' '{\"id\":2,\"result\":{\"data\":[{\"id\":\"" + ids[2]
      + "\",\"name\":\"Jay: \\\"x\\\"\",\"preview\":\"Ignore preview\"}],\"nextCursor\":null}}';;\n"
      "3) printf '%s\\n' '{\"id\":3,\"result\":{\"data\":[],\"nextCursor\":null}}';;");
  expect(title(getRecentChatCatalog(20), 2) == "Jay: \"x\"", "Explicit speaker labels and quotes must remain verbatim");
  fs::remove(codex / "calls");
  setenv("CHAT_HISTORY_BENCHMARK_CONFIG", "titles-test", 1);
  setenv("CHAT_HISTORY_BENCHMARK_HOME", home.c_str(), 1);
  const auto fixture = getRecentChatCatalog(20);
  unsetenv("CHAT_HISTORY_BENCHMARK_CONFIG");
  unsetenv("CHAT_HISTORY_BENCHMARK_HOME");
  expect(!fs::exists(codex / "calls") && title(fixture, 2).starts_with("Codex chat — "),
      "Benchmark fixture catalogs must not launch the Codex CLI");
  fs::remove(home / ".codex"); // Subsequent reads must honor CODEX_HOME alone.
  stub("2) printf '%s\\n' '{\"id\":2,\"result\":{\"data\":[],\"nextCursor\":null}}';;\n3) printf '%s\\n' '{\"id\":3,\"result\":{\"data\":[],\"nextCursor\":null}}';;");
  const auto empty = getRecentChatCatalog(20);
  expect(title(empty, 0) == "JOB_DIR=/tmp/fictional explicit name" && title(empty, 2).starts_with("Codex chat — "),
      "Empty metadata must preserve indexed names and the unnamed fallback");
  std::ofstream(bin / "codex") << "#!/bin/sh\nexit 1\n";
  const auto unavailable = getRecentChatCatalog(20);
  expect(title(unavailable, 0) == "JOB_DIR=/tmp/fictional explicit name" && title(unavailable, 2).starts_with("Codex chat — "),
      "Unavailable/older CLI must preserve indexed names and the unnamed fallback");
  // The server waits indefinitely for another request, so only the client's
  // timeout can complete this catalog load. Resource-gate pauses are harmless.
  stub("*) IFS= read -r ignored; exit 0;;");
  const auto timedOut = getRecentChatCatalog(20);
  expect(title(timedOut, 0) == "JOB_DIR=/tmp/fictional explicit name" && title(timedOut, 2).starts_with("Codex chat — "),
      "Timed-out metadata must preserve index and unnamed fallback titles");
  for (size_t i = 0; i < keys.size(); ++i) {
    if (saved[i]) setenv(keys[i].c_str(), saved[i]->c_str(), 1);
    else unsetenv(keys[i].c_str());
  }
  fs::remove_all(home);
}

void testStartupCatalog(const std::filesystem::path& fixtureRoot) {
  const auto testHome = std::filesystem::temp_directory_path() /
      ("legend-chat-startup-" + std::to_string(getpid()));
  const auto sessions = testHome / ".codex/sessions";
  std::filesystem::create_directories(sessions);
  const std::string id = "55555555-5555-5555-5555-555555555555";
  const auto path = sessions / ("rollout-" + id + ".jsonl");
  std::filesystem::copy_file(fixtureRoot / "codex.jsonl", path,
      std::filesystem::copy_options::overwrite_existing);
  std::ofstream(testHome / ".codex/session_index.jsonl")
      << "{\"id\":\"" << id << "\",\"thread_name\":\"Startup\",\"updated_at\":\"2026-01-01T10:00:00Z\"}\n";
  const std::string newerId = "66666666-6666-6666-6666-666666666666";
  const auto newerPath = sessions / ("rollout-" + newerId + ".jsonl");
  std::filesystem::copy_file(fixtureRoot / "codex.jsonl", newerPath,
      std::filesystem::copy_options::overwrite_existing);
  std::filesystem::last_write_time(newerPath,
      std::filesystem::last_write_time(path) + std::chrono::seconds(60));
  std::ofstream(testHome / ".codex/session_index.jsonl", std::ios::app)
      << "{\"id\":\"" << newerId << "\",\"thread_name\":\"Newer\",\"updated_at\":\"2026-01-02T10:00:00Z\"}\n";
  const auto previousConfig = std::getenv("CHAT_HISTORY_BENCHMARK_CONFIG");
  const auto previousFixtureHome = std::getenv("CHAT_HISTORY_BENCHMARK_HOME");
  const std::string savedConfig = previousConfig ? previousConfig : "";
  const std::string savedFixtureHome = previousFixtureHome ? previousFixtureHome : "";
  setenv("CHAT_HISTORY_BENCHMARK_CONFIG", "startup-test", 1);
  setenv("CHAT_HISTORY_BENCHMARK_HOME", testHome.c_str(), 1);

  startChatStartupCatalog(20, "codex:" + id);
  HybridChatHistory history;
  auto summaries = history.getRecentChats(20)->get();
  expect(summaries.size() == 2 && summaries[0].id == "codex:" + newerId,
      "JS must adopt the actual discovered catalog");
  expect(takeChatStartupCatalog(20) == nullptr, "Startup discovery is consumed exactly once");
  auto load = takeChatStartupLoad("codex", path.string());
  expect(load != nullptr && !load->takeResult().rows.empty(),
      "Discovery must start the resolved initial document without a React effect");

  startChatStartupCatalog(20, "codex:missing", true, true);
  (void)history.getRecentChats(20)->get();
  expect(takeChatStartupLoad("codex", path.string()) == nullptr,
      "A missing pinned ID must not preload a different conversation");

  startChatStartupCatalog(20, "codex:deleted");
  (void)history.getRecentChats(20)->get();
  load = takeChatStartupLoad("codex", newerPath.string());
  expect(load != nullptr && !load->takeResult().rows.empty(),
      "A stale normal selection must fall back to the newest discovered chat");
  startChatStartupCatalog(20, "");
  (void)history.getRecentChats(20)->get();
  auto document = history.openChat("codex", newerPath.string())->get();
  expect(document->getRowCount() > 0, "First launch must adopt the newest discovered chat");
  document->releaseNativeResources();

  startChatStartupCatalog(20, "", false);
  (void)history.getRecentChats(20)->get();
  expect(takeChatStartupLoad("codex", path.string()) == nullptr,
      "Saved-selection parsing must not be duplicated by catalog preparation");
  std::filesystem::remove(path);
  std::filesystem::remove(newerPath);
  expect(history.getRecentChats(20)->get().empty(), "Later refreshes must scan fresh catalog state");

  if (previousConfig) setenv("CHAT_HISTORY_BENCHMARK_CONFIG", savedConfig.c_str(), 1);
  else unsetenv("CHAT_HISTORY_BENCHMARK_CONFIG");
  if (previousFixtureHome) setenv("CHAT_HISTORY_BENCHMARK_HOME", savedFixtureHome.c_str(), 1);
  else unsetenv("CHAT_HISTORY_BENCHMARK_HOME");
  std::filesystem::remove_all(testHome);
}

void testStartupLoad(const std::filesystem::path& fixtureRoot) {
  const std::string path = (fixtureRoot / "codex.jsonl").string();
  // React cancels before its initial open; that must not cancel the host read.
  startChatStartupLoad("codex", path);
  HybridChatHistory history;
  history.cancelPendingOpen();
  auto document = history.openChat("codex", path)->get();
  expect(document->getRowCount() > 0, "The initial cancel-before-open must preserve startup loading");
  expect(takeChatStartupLoad("codex", path) == nullptr, "openChat must consume the startup request");
  document->releaseNativeResources();
  auto reopened = history.openChat("codex", path)->get();
  expect(reopened->getDocumentId() != document->getDocumentId(), "Later opens must read a new document");
  reopened->releaseNativeResources();

  startChatStartupLoad("codex", path);
  auto load = takeChatStartupLoad("codex", path);
  expect(load != nullptr, "The first matching open should adopt the launch read");
  expect(takeChatStartupLoad("codex", path) == nullptr, "A launch read must never be reused");
  expect(!load->takeResult().rows.empty(), "The launch worker should parse the selected transcript");

  startChatStartupLoad("codex", path);
  expect(takeChatStartupLoad("claude", path) == nullptr, "Provider changes must discard the launch read");
  expect(takeChatStartupLoad("codex", path) == nullptr, "A discarded launch read must not be retained");

  startChatStartupLoad("codex", path);
  expect(takeChatStartupLoad("codex", path + ".other") == nullptr, "Path changes must discard the launch read");

  startChatStartupLoad("codex", path);
  load = takeChatStartupLoad("codex", path);
  load->cancel();
  bool cancelled = false;
  try { (void)load->takeResult(); } catch (const std::runtime_error&) { cancelled = true; }
  expect(cancelled, "Cancelling an adopted launch read must prevent its delivery");

  startChatStartupLoad("codex", path + ".missing");
  load = takeChatStartupLoad("codex", path + ".missing");
  bool rejected = false;
  try { (void)load->takeResult(); } catch (const std::runtime_error&) { rejected = true; }
  expect(rejected, "Launch I/O failures must reach the matching open");
}

void testMissingCatalogRoots() {
  const std::filesystem::path testHome = std::filesystem::temp_directory_path() /
      ("legend-chat-history-empty-" + std::to_string(getpid()));
  std::filesystem::create_directories(testHome);

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

  expect(summaries.empty(), "Missing Codex and Claude directories should produce an empty catalog");
}

} // namespace

int main(int argc, char** argv) {
  if ((argc == 2 || argc == 3) && std::string(argv[1]) == "--audit-recent") {
    try {
      size_t consumed = 0;
      const std::string argument = argc == 3 ? argv[2] : "20";
      const auto limit = std::stoul(argument, &consumed);
      if (consumed != argument.size() || limit == 0 || limit > 1000) {
        throw std::invalid_argument("limit");
      }
      return auditRecentChats(limit);
    } catch (...) {
      std::cerr << "Recent-chat audit failed; limit must be an integer from 1 to 1000\n";
      return 1;
    }
  }
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
                << " fast=" << result.codexFastPathRecords
                << " fallback=" << result.codexFallbackRecords
                << " fallback_bytes=" << result.codexFallbackBytes
                << " warnings=" << result.warningCount
                << " mapped_ms=" << result.mappedMs
                << " scanned_ms=" << result.scannedMs
                << " normalized_ms=" << result.normalizedMs
                << " total_ms=" << totalMs << '\n';
      ChatDocumentTiming timing(
          static_cast<double>(result.source->size()),
          static_cast<double>(result.recordCount),
          static_cast<double>(result.rows.size()),
          result.mappedMs,
          result.scannedMs,
          result.normalizedMs,
          totalMs,
          0);
      auto document = std::make_shared<HybridChatDocument>("probe", std::move(result), timing);
      std::cout << "digest=" << document->getContentDigest() << '\n';
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
    testStartupLoad(fixtureRoot);
    testStartupCatalog(fixtureRoot);
    testCodex(fixtureRoot);
    testClaude(fixtureRoot);
    testCurrentCodexUserMessages(fixtureRoot);
    testCodexEnvelopeSchemas(fixtureRoot);
    testArrayToolOutputIsShallow();
    testCancellation(fixtureRoot);
    testIsoTimestamps();
    testDocumentRelease(fixtureRoot);
    testMissingCatalogRoots();
    testCatalogIndexes();
    testCodexProtocolTitles();
    std::cout << "chat history native tests passed\n";
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
  return 0;
}
