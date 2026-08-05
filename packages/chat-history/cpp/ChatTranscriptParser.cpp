#include "ChatDocument.hpp"
#include "ChatTime.hpp"

#include <algorithm>
#include <chrono>
#include <cstring>
#include <fcntl.h>
#include <iterator>
#include <stdexcept>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#include <tuple>
#include <unordered_map>
#include <unordered_set>

namespace margelo::nitro::legendapps::chathistory {

namespace {

using Clock = std::chrono::steady_clock;

struct MappedChatSource final : ChatSource {
  MappedChatSource(int descriptor, const char* mappedData, size_t mappedSize)
      : descriptor_(descriptor), data_(mappedData), size_(mappedSize) {}

  ~MappedChatSource() override {
    if (data_ != nullptr && size_ > 0) {
      munmap(const_cast<char*>(data_), size_);
    }
    if (descriptor_ >= 0) {
      close(descriptor_);
    }
  }

  const char* data() const noexcept override {
    return data_;
  }

  size_t size() const noexcept override {
    return size_;
  }

  size_t externalMemorySize() const noexcept override {
    return size_;
  }

private:
  int descriptor_ = -1;
  const char* data_ = nullptr;
  size_t size_ = 0;
};

struct EmptyChatSource final : ChatSource {
  const char* data() const noexcept override {
    return "";
  }

  size_t size() const noexcept override {
    return 0;
  }

  size_t externalMemorySize() const noexcept override {
    return 0;
  }
};

struct LineRange {
  size_t start = 0;
  size_t end = 0;
};

struct ClaudeRecord {
  JsonRange root;
  std::string uuid;
  std::string parentUuid;
  std::string type;
  bool sidechain = false;
  double timestampMs = 0;
};

struct PendingFileChanges {
  std::string turnId;
  ChatRow row;
  std::unordered_map<std::string, size_t> indexByPath;

  PendingFileChanges() {
    row.kind = "files";
  }
};

double elapsedMs(Clock::time_point start, Clock::time_point end) {
  return std::chrono::duration<double, std::milli>(end - start).count();
}

std::vector<LineRange> scanLines(
    const ChatSource& source,
    uint64_t generation,
    const std::atomic<uint64_t>& activeGeneration) {
  constexpr size_t cancellationCheckBytes = 0x40000;
  std::vector<LineRange> lines;
  const char* data = source.data();
  const size_t sourceSize = source.size();
  size_t lineStart = 0;
  size_t searchStart = 0;
  size_t cancellationBoundary = 0;
  while (searchStart < sourceSize) {
    if (searchStart >= cancellationBoundary) {
      if (activeGeneration.load(std::memory_order_relaxed) != generation) {
        throw std::runtime_error("Chat open cancelled");
      }
      cancellationBoundary = searchStart + std::min(cancellationCheckBytes, sourceSize - searchStart);
    }
    const void* newline = std::memchr(
        data + searchStart,
        '\n',
        cancellationBoundary - searchStart);
    if (newline != nullptr) {
      const size_t position = static_cast<const char*>(newline) - data;
      size_t lineEnd = position;
      if (lineEnd > lineStart && data[lineEnd - 1] == '\r') {
        lineEnd -= 1;
      }
      if (lineEnd > lineStart) {
        lines.push_back(LineRange{lineStart, lineEnd});
      }
      lineStart = position + 1;
      searchStart = lineStart;
    } else {
      searchStart = cancellationBoundary;
    }
  }
  if (lineStart < sourceSize) {
    lines.push_back(LineRange{lineStart, sourceSize});
  }
  return lines;
}

std::optional<JsonRange> objectMember(const ChatJson& json, const std::optional<JsonRange>& object, std::string_view key) {
  return object ? json.member(*object, key) : std::nullopt;
}

std::string stringMember(const ChatJson& json, const JsonRange& object, std::string_view key) {
  const auto value = json.member(object, key);
  return value ? json.stringValue(*value) : std::string();
}

std::vector<std::string> stringArrayMember(
    const ChatJson& json,
    const JsonRange& object,
    std::string_view key,
    size_t maximumEncodedBytes = 0,
    bool* hasOmittedValue = nullptr) {
  std::vector<std::string> values;
  const auto array = json.member(object, key);
  if (array && array->kind == JsonValueKind::Array) {
    json.forEachArrayValue(*array, [&](const JsonRange& value) {
      if (value.kind == JsonValueKind::String
          && (maximumEncodedBytes == 0 || value.end - value.start <= maximumEncodedBytes)) {
        std::string decoded = json.stringValue(value);
        if (!decoded.empty()) {
          values.push_back(std::move(decoded));
        } else if (hasOmittedValue) {
          *hasOmittedValue = true;
        }
      } else if (hasOmittedValue) {
        *hasOmittedValue = true;
      }
      return true;
    });
  }
  return values;
}

std::string relativeFilePath(const std::string& path, const std::string& cwd) {
  const std::string prefix = cwd.empty() || cwd.back() == '/' ? cwd : cwd + "/";
  return !prefix.empty() && path.starts_with(prefix) ? path.substr(prefix.size()) : path;
}

std::pair<size_t, size_t> countUnifiedDiffLines(const std::string& diff) {
  size_t additions = 0;
  size_t deletions = 0;
  size_t lineStart = 0;
  bool inHunk = false;
  while (lineStart < diff.size()) {
    const size_t lineEnd = diff.find('\n', lineStart);
    const size_t lineSize = (lineEnd == std::string::npos ? diff.size() : lineEnd) - lineStart;
    if (lineSize >= 2 && diff.compare(lineStart, 2, "@@") == 0) {
      inHunk = true;
    } else if (inHunk && lineSize > 0 && diff[lineStart] == '+') {
      additions += 1;
    } else if (inHunk && lineSize > 0 && diff[lineStart] == '-') {
      deletions += 1;
    }
    if (lineEnd == std::string::npos) {
      break;
    }
    lineStart = lineEnd + 1;
  }
  return {additions, deletions};
}

size_t countContentLines(const std::string& content) {
  return static_cast<size_t>(std::count(content.begin(), content.end(), '\n'))
      + (!content.empty() && content.back() != '\n' ? 1 : 0);
}

void appendPendingFileChanges(std::vector<ChatRow>& rows, PendingFileChanges& pending) {
  if (!pending.row.fileChanges.empty()) {
    rows.push_back(std::move(pending.row));
  }
  pending = PendingFileChanges();
}

void collectCodexFileChanges(
    const ChatJson& json,
    const JsonRange& payload,
    const std::string& cwd,
    std::vector<ChatRow>& rows,
    PendingFileChanges& pending,
    size_t& warningCount) {
  const auto success = json.member(payload, "success");
  const auto changes = json.member(payload, "changes");
  if (!success || !json.boolValue(*success) || !changes || changes->kind != JsonValueKind::Object) {
    return;
  }

  const std::string turnId = stringMember(json, payload, "turn_id");
  if (!pending.turnId.empty() && !turnId.empty() && pending.turnId != turnId) {
    appendPendingFileChanges(rows, pending);
  }
  pending.turnId = turnId;
  const bool valid = json.forEachObjectMember(*changes, [&](const JsonRange& pathRange, const JsonRange& change) {
    if (change.kind == JsonValueKind::Object) {
      const std::string path = relativeFilePath(json.stringValue(pathRange), cwd);
      const std::string changeType = stringMember(json, change, "type");
      const auto unifiedDiff = json.member(change, "unified_diff");
      const auto content = json.member(change, "content");
      size_t additions = 0;
      size_t deletions = 0;
      bool supported = false;
      if (changeType == "update" && unifiedDiff && unifiedDiff->kind == JsonValueKind::String) {
        std::tie(additions, deletions) = countUnifiedDiffLines(json.stringValue(*unifiedDiff));
        supported = true;
      } else if ((changeType == "add" || changeType == "delete") && content && content->kind == JsonValueKind::String) {
        const size_t contentLines = countContentLines(json.stringValue(*content));
        additions = changeType == "add" ? contentLines : 0;
        deletions = changeType == "delete" ? contentLines : 0;
        supported = true;
      }

      if (!supported) {
        warningCount += 1;
        return true;
      }
      const auto found = pending.indexByPath.find(path);
      if (found == pending.indexByPath.end()) {
        pending.indexByPath[path] = pending.row.fileChanges.size();
        pending.row.fileChanges.push_back(ChatRow::FileChange{path, additions, deletions});
      } else {
        ChatRow::FileChange& file = pending.row.fileChanges[found->second];
        file.additions += additions;
        file.deletions += deletions;
      }
    } else {
      warningCount += 1;
    }
    return true;
  });
  if (!valid) {
    warningCount += 1;
  }
}

void appendMessageRow(
    std::vector<ChatRow>& rows,
    std::string kind,
    std::vector<JsonRange> markdownRanges,
    std::vector<std::string> imageSources,
    bool hasImagePlaceholder,
    double timestampMs) {
  if (!markdownRanges.empty() || !imageSources.empty() || hasImagePlaceholder) {
    ChatRow row;
    row.kind = std::move(kind);
    row.markdownRanges = std::move(markdownRanges);
    row.imageSources = std::move(imageSources);
    row.hasImagePlaceholder = hasImagePlaceholder;
    row.startedAtMs = timestampMs;
    row.endedAtMs = timestampMs;
    rows.push_back(std::move(row));
  }
}

size_t appendToolRow(
    std::vector<ChatRow>& rows,
    std::unordered_map<std::string, size_t>& toolRows,
    std::string callId,
    std::string name,
    std::vector<JsonRange> previews,
    double timestampMs) {
  ChatRow row;
  row.kind = "tool";
  row.callId = std::move(callId);
  row.toolName = name.empty() ? "Tool" : std::move(name);
  row.toolStatus = "unknown";
  row.previewRanges = std::move(previews);
  row.startedAtMs = timestampMs;
  row.endedAtMs = timestampMs;
  rows.push_back(std::move(row));
  const size_t index = rows.size() - 1;
  if (!rows[index].callId.empty()) {
    toolRows[rows[index].callId] = index;
  }
  return index;
}

void applyToolResult(
    std::vector<ChatRow>& rows,
    std::unordered_map<std::string, size_t>& toolRows,
    const std::string& callId,
    std::vector<JsonRange> previews,
    bool failed,
    double timestampMs) {
  size_t index = rows.size();
  const auto found = toolRows.find(callId);
  if (found != toolRows.end()) {
    index = found->second;
  } else {
    index = appendToolRow(rows, toolRows, callId, "Tool", {}, timestampMs);
  }
  rows[index].toolStatus = failed ? "failed" : "completed";
  rows[index].endedAtMs = std::max(rows[index].endedAtMs, timestampMs);
  if (!previews.empty()) {
    rows[index].previewRanges = std::move(previews);
  }
}

void parseCodexAssistantMessage(
    const ChatJson& json,
    const JsonRange& payload,
    std::vector<ChatRow>& rows,
    size_t& warningCount,
    double timestampMs) {
  const std::string role = stringMember(json, payload, "role");
  if (role != "assistant") {
    return;
  }

  std::vector<JsonRange> textRanges;
  bool hasImage = false;
  const auto content = json.member(payload, "content");
  if (content && content->kind == JsonValueKind::Array) {
    const bool valid = json.forEachArrayValue(*content, [&](const JsonRange& block) {
      if (block.kind == JsonValueKind::Object) {
        const std::string blockType = stringMember(json, block, "type");
        if (blockType == "input_text" || blockType == "output_text" || blockType == "text") {
          const auto text = json.member(block, "text");
          if (text && text->kind == JsonValueKind::String) {
            textRanges.push_back(*text);
          }
        } else if (blockType == "input_image" || blockType == "image") {
          hasImage = true;
        } else if (!blockType.empty()) {
          warningCount += 1;
        }
      }
      return true;
    });
    if (!valid) {
      warningCount += 1;
    }
  } else if (content && content->kind == JsonValueKind::String) {
    textRanges.push_back(*content);
  } else if (content) {
    warningCount += 1;
  }
  appendMessageRow(rows, role, std::move(textRanges), {}, hasImage, timestampMs);
}

ChatParseResult parseCodex(
    std::shared_ptr<const ChatSource> source,
    const std::vector<LineRange>& lines,
    uint64_t generation,
    const std::atomic<uint64_t>& activeGeneration) {
  const auto startedAt = Clock::now();
  ChatParseResult result;
  result.source = std::move(source);
  result.recordCount = lines.size();
  const ChatJson json(result.source->data(), result.source->size());
  std::unordered_map<std::string, size_t> toolRows;
  PendingFileChanges pendingFileChanges;
  std::string cwd;

  for (size_t lineIndex = 0; lineIndex < lines.size(); lineIndex += 1) {
    if ((lineIndex & 0xff) == 0 && activeGeneration.load(std::memory_order_relaxed) != generation) {
      throw std::runtime_error("Chat open cancelled");
    }
    const auto root = json.topLevelObject(lines[lineIndex].start, lines[lineIndex].end);
    if (!root || root->kind != JsonValueKind::Object) {
      result.warningCount += 1;
      continue;
    }
    std::string recordType;
    std::optional<JsonRange> payload;
    std::optional<JsonRange> timestamp;
    size_t cursor = root->start + 1;
    timestamp = json.orderedMember(*root, cursor, "timestamp");
    const auto recordTypeRange = timestamp
        ? json.orderedMember(*root, cursor, "type")
        : std::nullopt;
    payload = recordTypeRange
        ? json.orderedTrailingMember(*root, cursor, "payload")
        : std::nullopt;
    bool validRecord = timestamp && recordTypeRange && payload;
    if (validRecord) {
      recordType = json.stringValue(*recordTypeRange);
    } else {
      validRecord = json.forEachObjectMember(
          *root,
          [&](const JsonRange& key, const JsonRange& value) {
            if (json.stringEquals(key, "type")) {
              recordType = json.stringValue(value);
            } else if (json.stringEquals(key, "payload")) {
              payload = value;
            } else if (json.stringEquals(key, "timestamp")) {
              timestamp = value;
            }
            return true;
          });
    }
    if (!validRecord) {
      result.warningCount += 1;
      continue;
    }
    if (recordType == "compacted") {
      continue;
    }
    if ((recordType == "session_meta" || recordType == "turn_context") && payload && payload->kind == JsonValueKind::Object) {
      const std::string nextCwd = stringMember(json, *payload, "cwd");
      if (!nextCwd.empty()) {
        cwd = nextCwd;
      }
      continue;
    }
    if (recordType == "event_msg" && payload && payload->kind == JsonValueKind::Object) {
      const std::string eventType = stringMember(json, *payload, "type");
      if (eventType == "user_message") {
        appendPendingFileChanges(result.rows, pendingFileChanges);
        std::vector<JsonRange> textRanges;
        const auto message = json.member(*payload, "message");
        if (message && message->kind == JsonValueKind::String) {
          textRanges.push_back(*message);
        } else {
          result.warningCount += 1;
        }
        bool hasImagePlaceholder = false;
        std::vector<std::string> imageSources = stringArrayMember(json, *payload, "local_images");
        std::vector<std::string> remoteImages = stringArrayMember(
            json,
            *payload,
            "images",
            8 * 1024,
            &hasImagePlaceholder);
        imageSources.insert(
            imageSources.end(),
            std::make_move_iterator(remoteImages.begin()),
            std::make_move_iterator(remoteImages.end()));
        appendMessageRow(
            result.rows,
            "user",
            std::move(textRanges),
            std::move(imageSources),
            hasImagePlaceholder,
            timestamp && timestamp->kind == JsonValueKind::String
                ? parseIsoTimestampMilliseconds(json.stringValue(*timestamp))
                : 0);
      } else if (eventType == "patch_apply_end") {
        collectCodexFileChanges(
            json,
            *payload,
            cwd,
            result.rows,
            pendingFileChanges,
            result.warningCount);
      }
      continue;
    }
    if (recordType != "response_item") {
      continue;
    }
    if (!payload || payload->kind != JsonValueKind::Object) {
      result.warningCount += 1;
      continue;
    }

    const double timestampMs = timestamp && timestamp->kind == JsonValueKind::String
        ? parseIsoTimestampMilliseconds(json.stringValue(*timestamp))
        : 0;
    const std::string payloadType = stringMember(json, *payload, "type");
    if (payloadType == "message") {
      parseCodexAssistantMessage(json, *payload, result.rows, result.warningCount, timestampMs);
    } else if (payloadType == "function_call" || payloadType == "custom_tool_call" || payloadType == "local_shell_call") {
      std::vector<JsonRange> previews;
      const auto arguments = json.member(*payload, payloadType == "custom_tool_call" ? "input" : "arguments");
      if (arguments && arguments->kind == JsonValueKind::String) {
        previews.push_back(*arguments);
      }
      appendToolRow(
          result.rows,
          toolRows,
          stringMember(json, *payload, "call_id"),
          stringMember(json, *payload, "name"),
          std::move(previews),
          timestampMs);
    } else if (payloadType == "function_call_output" || payloadType == "custom_tool_call_output") {
      std::vector<JsonRange> previews;
      const auto output = json.member(*payload, "output");
      if (output && output->kind == JsonValueKind::String) {
        previews.push_back(*output);
      }
      applyToolResult(
          result.rows,
          toolRows,
          stringMember(json, *payload, "call_id"),
          std::move(previews),
          false,
          timestampMs);
    } else if (payloadType == "image_generation_call") {
      const std::string callId = stringMember(json, *payload, "id");
      size_t rowIndex = result.rows.size();
      const auto found = toolRows.find(callId);
      if (found != toolRows.end()) {
        rowIndex = found->second;
      } else {
        rowIndex = appendToolRow(result.rows, toolRows, callId, "Image generation", {}, timestampMs);
      }
      const auto imageResult = json.member(*payload, "result");
      const bool hasResult = imageResult && imageResult->kind == JsonValueKind::String && imageResult->end > imageResult->start + 2;
      const std::string status = stringMember(json, *payload, "status");
      result.rows[rowIndex].toolStatus = status == "failed" ? "failed" : hasResult ? "completed" : "unknown";
      result.rows[rowIndex].hasImagePlaceholder = result.rows[rowIndex].hasImagePlaceholder || hasResult;
      result.rows[rowIndex].endedAtMs = std::max(result.rows[rowIndex].endedAtMs, timestampMs);
    } else if (payloadType != "reasoning" && !payloadType.empty()) {
      result.warningCount += 1;
    }
  }
  appendPendingFileChanges(result.rows, pendingFileChanges);
  result.normalizedMs = elapsedMs(startedAt, Clock::now());
  return result;
}

void collectClaudeToolResultRanges(
    const ChatJson& json,
    const JsonRange& content,
    std::vector<JsonRange>& previews,
    bool& imagePlaceholder,
    size_t& warningCount) {
  if (content.kind == JsonValueKind::String) {
    previews.push_back(content);
  } else if (content.kind == JsonValueKind::Array) {
    const bool valid = json.forEachArrayValue(content, [&](const JsonRange& block) {
      if (block.kind == JsonValueKind::String) {
        previews.push_back(block);
      } else if (block.kind == JsonValueKind::Object) {
        const std::string type = stringMember(json, block, "type");
        const auto text = json.member(block, "text");
        if (type == "text" && text && text->kind == JsonValueKind::String) {
          previews.push_back(*text);
        } else if (type == "image") {
          imagePlaceholder = true;
        } else if (type != "text") {
          warningCount += 1;
        }
      }
      return true;
    });
    if (!valid) {
      warningCount += 1;
    }
  }
}

void parseClaudeMessage(
    const ChatJson& json,
    const ClaudeRecord& record,
    std::vector<ChatRow>& rows,
    std::unordered_map<std::string, size_t>& toolRows,
    size_t& warningCount) {
  const auto message = json.member(record.root, "message");
  const auto content = objectMember(json, message, "content");
  if (!message || message->kind != JsonValueKind::Object || !content) {
    warningCount += 1;
    return;
  }

  if (content->kind == JsonValueKind::String) {
    appendMessageRow(rows, record.type, {*content}, {}, false, record.timestampMs);
    return;
  }
  if (content->kind != JsonValueKind::Array) {
    warningCount += 1;
    return;
  }

  std::vector<JsonRange> textRanges;
  bool hasImage = false;
  std::vector<std::function<void()>> deferredTools;
  const bool valid = json.forEachArrayValue(*content, [&](const JsonRange& block) {
    if (block.kind != JsonValueKind::Object) {
      warningCount += 1;
      return true;
    }
    const std::string blockType = stringMember(json, block, "type");
    if (blockType == "text") {
      const auto text = json.member(block, "text");
      if (text && text->kind == JsonValueKind::String) {
        textRanges.push_back(*text);
      }
    } else if (blockType == "image" || blockType == "document") {
      hasImage = true;
    } else if (blockType == "tool_use") {
      const std::string callId = stringMember(json, block, "id");
      const std::string name = stringMember(json, block, "name");
      deferredTools.push_back([&, callId, name]() {
        appendToolRow(rows, toolRows, callId, name, {}, record.timestampMs);
      });
    } else if (blockType == "tool_result") {
      const std::string callId = stringMember(json, block, "tool_use_id");
      const auto resultContent = json.member(block, "content");
      std::vector<JsonRange> previews;
      bool resultImage = false;
      if (resultContent) {
        collectClaudeToolResultRanges(json, *resultContent, previews, resultImage, warningCount);
      }
      const auto isError = json.member(block, "is_error");
      const bool failed = isError && json.boolValue(*isError);
      deferredTools.push_back([&, callId, previews = std::move(previews), failed, resultImage]() mutable {
        applyToolResult(rows, toolRows, callId, std::move(previews), failed, record.timestampMs);
        const auto found = toolRows.find(callId);
        if (resultImage && found != toolRows.end()) {
          rows[found->second].hasImagePlaceholder = true;
        }
      });
    } else if (blockType != "thinking") {
      warningCount += 1;
    }
    return true;
  });
  if (!valid) {
    warningCount += 1;
  }
  appendMessageRow(rows, record.type, std::move(textRanges), {}, hasImage, record.timestampMs);
  for (auto& appendTool : deferredTools) {
    appendTool();
  }
}

ChatParseResult parseClaude(
    std::shared_ptr<const ChatSource> source,
    const std::vector<LineRange>& lines,
    uint64_t generation,
    const std::atomic<uint64_t>& activeGeneration) {
  const auto startedAt = Clock::now();
  ChatParseResult result;
  result.source = std::move(source);
  result.recordCount = lines.size();
  const ChatJson json(result.source->data(), result.source->size());
  std::vector<ClaudeRecord> records;
  records.reserve(lines.size());
  std::unordered_map<std::string, size_t> recordById;
  std::string leafId;

  for (size_t lineIndex = 0; lineIndex < lines.size(); lineIndex += 1) {
    if ((lineIndex & 0xff) == 0 && activeGeneration.load(std::memory_order_relaxed) != generation) {
      throw std::runtime_error("Chat open cancelled");
    }
    const auto root = json.root(lines[lineIndex].start, lines[lineIndex].end);
    if (!root || root->kind != JsonValueKind::Object) {
      result.warningCount += 1;
      continue;
    }
    ClaudeRecord record;
    record.root = *root;
    record.uuid = stringMember(json, *root, "uuid");
    record.parentUuid = stringMember(json, *root, "parentUuid");
    record.type = stringMember(json, *root, "type");
    record.timestampMs = parseIsoTimestampMilliseconds(stringMember(json, *root, "timestamp"));
    const auto sidechain = json.member(*root, "isSidechain");
    record.sidechain = sidechain && json.boolValue(*sidechain);
    records.push_back(std::move(record));
    if (!records.back().uuid.empty() && !records.back().sidechain) {
      recordById[records.back().uuid] = records.size() - 1;
      leafId = records.back().uuid;
    }
  }

  std::unordered_set<std::string> mainChain;
  std::string cursor = leafId;
  while (!cursor.empty() && mainChain.insert(cursor).second) {
    const auto found = recordById.find(cursor);
    if (found == recordById.end()) {
      result.warningCount += 1;
      break;
    }
    cursor = records[found->second].parentUuid;
  }

  std::unordered_map<std::string, size_t> toolRows;
  for (const ClaudeRecord& record : records) {
    const bool onMainChain = !record.sidechain && !record.uuid.empty() && mainChain.contains(record.uuid);
    if (onMainChain && (record.type == "user" || record.type == "assistant")) {
      parseClaudeMessage(json, record, result.rows, toolRows, result.warningCount);
    }
  }
  result.normalizedMs = elapsedMs(startedAt, Clock::now());
  return result;
}

} // namespace

std::shared_ptr<const ChatSource> mapChatFile(const std::string& filePath) {
  const int descriptor = open(filePath.c_str(), O_RDONLY);
  if (descriptor < 0) {
    throw std::runtime_error("Failed to open transcript");
  }

  struct stat fileStat {};
  if (fstat(descriptor, &fileStat) != 0) {
    close(descriptor);
    throw std::runtime_error("Failed to stat transcript");
  }
  if (fileStat.st_size <= 0) {
    close(descriptor);
    return std::make_shared<EmptyChatSource>();
  }

  void* data = mmap(nullptr, static_cast<size_t>(fileStat.st_size), PROT_READ, MAP_PRIVATE, descriptor, 0);
  if (data == MAP_FAILED) {
    close(descriptor);
    throw std::runtime_error("Failed to map transcript");
  }
  return std::make_shared<MappedChatSource>(
      descriptor,
      static_cast<const char*>(data),
      static_cast<size_t>(fileStat.st_size));
}

ChatParseResult parseChatFile(
    const std::string& provider,
    const std::string& filePath,
    uint64_t generation,
    const std::atomic<uint64_t>& activeGeneration) {
  const auto mapStartedAt = Clock::now();
  auto source = mapChatFile(filePath);
  const auto mappedAt = Clock::now();
  const auto lines = scanLines(*source, generation, activeGeneration);
  const auto scannedAt = Clock::now();

  ChatParseResult result;
  if (provider == "codex") {
    result = parseCodex(std::move(source), lines, generation, activeGeneration);
  } else if (provider == "claude") {
    result = parseClaude(std::move(source), lines, generation, activeGeneration);
  } else {
    throw std::runtime_error("Unsupported chat provider");
  }
  result.mappedMs = elapsedMs(mapStartedAt, mappedAt);
  result.scannedMs = elapsedMs(mappedAt, scannedAt);
  return result;
}

} // namespace margelo::nitro::legendapps::chathistory
