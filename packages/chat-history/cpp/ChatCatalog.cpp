#include "ChatCatalog.hpp"

#include "ChatJson.hpp"
#include "ChatTime.hpp"

#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <optional>
#include <sstream>
#include <string>
#include <unordered_map>
#include <unordered_set>

namespace margelo::nitro::legendapps::chathistory {

namespace {

namespace fs = std::filesystem;

struct CatalogMetadata {
  std::string title;
  double updatedAt = 0;
};

struct CatalogCandidate {
  ChatSummary summary;
  bool requiresSourceProbe = false;
};

std::string readFile(const fs::path& path) {
  std::ifstream input(path, std::ios::binary);
  std::ostringstream buffer;
  if (input) {
    buffer << input.rdbuf();
  }
  return buffer.str();
}

std::optional<JsonRange> member(const ChatJson& json, const std::optional<JsonRange>& object, std::string_view key) {
  return object ? json.member(*object, key) : std::nullopt;
}

std::string stringMember(const ChatJson& json, const JsonRange& object, std::string_view key) {
  const auto value = json.member(object, key);
  return value ? json.stringValue(*value) : std::string();
}

double fileModifiedAt(const fs::path& path) {
  std::error_code error;
  const auto fileTime = fs::last_write_time(path, error);
  double milliseconds = 0;
  if (!error) {
    const auto systemTime = std::chrono::time_point_cast<std::chrono::system_clock::duration>(
        fileTime - fs::file_time_type::clock::now() + std::chrono::system_clock::now());
    milliseconds = static_cast<double>(
        std::chrono::duration_cast<std::chrono::milliseconds>(systemTime.time_since_epoch()).count());
  }
  return milliseconds;
}

std::string fallbackTitle(const std::string& provider, double updatedAt) {
  const std::time_t timestamp = static_cast<std::time_t>(updatedAt / 1000);
  std::tm local {};
  localtime_r(&timestamp, &local);
  std::ostringstream output;
  output << (provider == "codex" ? "Codex" : "Claude") << " chat — " << std::put_time(&local, "%b %e");
  return output.str();
}

std::string boundedTitle(std::string title) {
  std::replace(title.begin(), title.end(), '\n', ' ');
  std::replace(title.begin(), title.end(), '\r', ' ');
  if (title.size() > 120) {
    title.resize(117);
    title.append("…");
  }
  return title;
}

std::string sessionIdFromPath(const fs::path& path) {
  const std::string stem = path.stem().string();
  return stem.size() >= 36 ? stem.substr(stem.size() - 36) : stem;
}

void loadCodexIndex(const fs::path& path, std::unordered_map<std::string, CatalogMetadata>& metadata) {
  const std::string content = readFile(path);
  const ChatJson json(content.data(), content.size());
  size_t lineStart = 0;
  for (size_t position = 0; position <= content.size(); position += 1) {
    if (position == content.size() || content[position] == '\n') {
      const auto root = json.root(lineStart, position);
      if (root && root->kind == JsonValueKind::Object) {
        const std::string id = stringMember(json, *root, "id");
        if (!id.empty()) {
          CatalogMetadata value;
          value.title = stringMember(json, *root, "thread_name");
          value.updatedAt = parseIsoTimestampMilliseconds(stringMember(json, *root, "updated_at"));
          metadata[id] = std::move(value);
        }
      }
      lineStart = position + 1;
    }
  }
}

void loadClaudeIndex(const fs::path& path, std::unordered_map<std::string, CatalogMetadata>& metadata) {
  const std::string content = readFile(path);
  const ChatJson json(content.data(), content.size());
  const auto root = json.root(0, content.size());
  const auto entries = member(json, root, "entries");
  if (entries && entries->kind == JsonValueKind::Array) {
    json.forEachArrayValue(*entries, [&](const JsonRange& entry) {
      if (entry.kind == JsonValueKind::Object) {
        const std::string fullPath = stringMember(json, entry, "fullPath");
        if (!fullPath.empty()) {
          CatalogMetadata value;
          value.title = stringMember(json, entry, "summary");
          if (value.title.empty()) {
            value.title = stringMember(json, entry, "firstPrompt");
          }
          value.updatedAt = parseIsoTimestampMilliseconds(stringMember(json, entry, "modified"));
          if (value.updatedAt == 0) {
            const auto fileMtime = json.member(entry, "fileMtime");
            value.updatedAt = fileMtime ? json.numberValue(*fileMtime) : 0;
          }
          metadata[fullPath] = std::move(value);
        }
      }
      return true;
    });
  }
}

bool pathContainsComponent(const fs::path& path, std::string_view component) {
  return std::any_of(path.begin(), path.end(), [&](const fs::path& part) {
    return part.string() == component;
  });
}

bool isCodexSubagent(const std::string& path) {
  std::ifstream input(path, std::ios::binary);
  std::string firstRecord;
  std::getline(input, firstRecord);
  const ChatJson json(firstRecord.data(), firstRecord.size());
  const auto root = json.root(0, firstRecord.size());
  const auto payload = member(json, root, "payload");
  const auto source = member(json, payload, "source");
  const auto subagent = member(json, source, "subagent");
  return subagent && subagent->kind == JsonValueKind::Object;
}

void addProviderFiles(
    const fs::path& root,
    const std::string& provider,
    const std::unordered_map<std::string, CatalogMetadata>& metadata,
    std::vector<CatalogCandidate>& candidates) {
  std::error_code error;
  if (fs::exists(root, error)) {
    const auto options = fs::directory_options::skip_permission_denied;
    for (fs::recursive_directory_iterator iterator(root, options, error), end; iterator != end; iterator.increment(error)) {
      if (error) {
        error.clear();
        continue;
      }
      const fs::path path = iterator->path();
      if (!iterator->is_regular_file(error) || path.extension() != ".jsonl") {
        continue;
      }
      if (provider == "claude" && (pathContainsComponent(path, "subagents") || path.filename().string().starts_with("agent-"))) {
        continue;
      }

      const std::string pathText = path.string();
      const std::string sessionId = sessionIdFromPath(path);
      auto found = metadata.find(provider == "codex" ? sessionId : pathText);
      if (found == metadata.end() && provider == "claude") {
        found = metadata.find(sessionId);
      }
      const double updatedAt = found != metadata.end() && found->second.updatedAt > 0
          ? found->second.updatedAt
          : fileModifiedAt(path);
      std::string title = found != metadata.end() ? boundedTitle(found->second.title) : std::string();
      if (title.empty()) {
        title = fallbackTitle(provider, updatedAt);
      }
      candidates.push_back(CatalogCandidate{
          ChatSummary(
              provider + ":" + sessionId,
              provider,
              std::move(title),
              updatedAt,
              pathText),
          provider == "codex" && found == metadata.end()});
    }
  }
}

} // namespace

std::vector<ChatSummary> getRecentChatCatalog(size_t limit) {
  std::vector<ChatSummary> summaries;
  const char* homeValue = std::getenv("HOME");
  if (homeValue != nullptr && limit > 0) {
    const fs::path home(homeValue);
    std::unordered_map<std::string, CatalogMetadata> codexMetadata;
    std::unordered_map<std::string, CatalogMetadata> claudeMetadata;
    loadCodexIndex(home / ".codex" / "session_index.jsonl", codexMetadata);

    const fs::path claudeRoot = home / ".claude" / "projects";
    std::error_code error;
    if (fs::exists(claudeRoot, error)) {
      const auto options = fs::directory_options::skip_permission_denied;
      for (fs::recursive_directory_iterator iterator(claudeRoot, options, error), end; iterator != end; iterator.increment(error)) {
        if (error) {
          error.clear();
        } else if (iterator->is_regular_file(error) && iterator->path().filename() == "sessions-index.json") {
          loadClaudeIndex(iterator->path(), claudeMetadata);
        }
      }
    }

    std::vector<CatalogCandidate> candidates;
    addProviderFiles(home / ".codex" / "sessions", "codex", codexMetadata, candidates);
    addProviderFiles(home / ".codex" / "archived_sessions", "codex", codexMetadata, candidates);
    addProviderFiles(claudeRoot, "claude", claudeMetadata, candidates);
    std::sort(candidates.begin(), candidates.end(), [](const CatalogCandidate& left, const CatalogCandidate& right) {
      if (left.summary.updatedAt != right.summary.updatedAt) {
        return left.summary.updatedAt > right.summary.updatedAt;
      }
      return left.summary.id < right.summary.id;
    });

    summaries.reserve(std::min(limit, candidates.size()));
    std::unordered_set<std::string> seenIds;
    for (CatalogCandidate& candidate : candidates) {
      const bool firstOccurrence = seenIds.insert(candidate.summary.id).second;
      const bool visible = firstOccurrence
          && (!candidate.requiresSourceProbe || !isCodexSubagent(candidate.summary.path));
      if (visible) {
        summaries.push_back(std::move(candidate.summary));
        if (summaries.size() == limit) {
          break;
        }
      }
    }
  }
  return summaries;
}

} // namespace margelo::nitro::legendapps::chathistory
