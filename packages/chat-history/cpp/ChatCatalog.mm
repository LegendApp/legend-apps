#include "ChatCatalog.hpp"

#include "ChatJson.hpp"
#include "ChatTime.hpp"

#import <Foundation/Foundation.h>

#include <poll.h>
#include <sys/socket.h>
#include <signal.h>
#include <unistd.h>

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

// One short-lived app-server connection for the entire catalog, on the caller's
// existing background worker. Only initialize and thread/list are sent.
void loadCodexTitles(
    const fs::path& codexHome,
    const fs::path& home,
    const std::unordered_map<std::string, CatalogMetadata>& index,
    std::vector<ChatSummary>& summaries) {
  @autoreleasepool {
    std::unordered_map<std::string, ChatSummary*> remaining;
    for (auto& summary : summaries) {
      if (summary.provider == "codex") {
        remaining.emplace(summary.id.substr(6), &summary);
      }
    }
    if (remaining.empty()) return;

    // Finder launches do not inherit the user's interactive shell PATH.
    NSString* searchPath = [NSProcessInfo.processInfo.environment[@"PATH"] ?: @""
        stringByAppendingFormat:@":%s/.local/bin:%s/.bun/bin:/opt/homebrew/bin:/usr/local/bin",
        home.c_str(), home.c_str()];
    NSString* executable = nil;
    for (NSString* directory in [searchPath componentsSeparatedByString:@":"]) {
      if (directory.length == 0) continue;
      NSString* candidate = [directory stringByAppendingPathComponent:@"codex"];
      if ([NSFileManager.defaultManager isExecutableFileAtPath:candidate]) {
        executable = candidate;
        break;
      }
    }
    if (!executable) return;

    NSTask* task = [NSTask new];
    task.executableURL = [NSURL fileURLWithPath:executable];
    task.arguments = @[@"app-server", @"--listen", @"stdio://"];
    task.currentDirectoryURL = [NSURL fileURLWithPath:@(codexHome.c_str())];
    NSMutableDictionary* environment = [NSProcessInfo.processInfo.environment mutableCopy];
    environment[@"CODEX_HOME"] = @(codexHome.c_str());
    task.environment = environment;
    int sockets[2];
    if (socketpair(AF_UNIX, SOCK_STREAM, 0, sockets) != 0) return;
    const int noSigPipe = 1;
    setsockopt(sockets[0], SOL_SOCKET, SO_NOSIGPIPE, &noSigPipe, sizeof(noSigPipe));
    NSFileHandle* input = [[NSFileHandle alloc] initWithFileDescriptor:sockets[0] closeOnDealloc:YES];
    NSFileHandle* childInput = [[NSFileHandle alloc] initWithFileDescriptor:sockets[1] closeOnDealloc:YES];
    NSPipe* output = [NSPipe pipe];
    task.standardInput = childInput;
    task.standardOutput = output;
    task.standardError = NSFileHandle.fileHandleWithNullDevice;
    if (![task launchAndReturnError:nil]) return;
    [childInput closeFile];

    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(5);
    NSMutableData* pending = [NSMutableData data];
    size_t receivedBytes = 0;
    int requestId = 0;
    auto send = [&](NSDictionary* message) {
      NSMutableData* data = [[NSJSONSerialization dataWithJSONObject:message options:0 error:nil] mutableCopy];
      [data appendBytes:"\n" length:1];
      return data.length <= 4096 && ::send(input.fileDescriptor, data.bytes, data.length, MSG_DONTWAIT)
          == static_cast<ssize_t>(data.length);
    };
    // Bound time, pages and output even if the CLI is old or misbehaves.
    auto request = [&](NSString* method, NSDictionary* params) -> NSDictionary* {
      const int responseId = ++requestId;
      if (std::chrono::steady_clock::now() >= deadline
          || !send(@{@"id": @(responseId), @"method": method, @"params": params})) return nil;
      while (std::chrono::steady_clock::now() < deadline) {
        const char* bytes = static_cast<const char*>(pending.bytes);
        const void* newline = memchr(bytes, '\n', pending.length);
        if (newline) {
          const size_t length = static_cast<const char*>(newline) - bytes;
          NSData* line = [pending subdataWithRange:NSMakeRange(0, length)];
          [pending replaceBytesInRange:NSMakeRange(0, length + 1) withBytes:nullptr length:0];
          id message = [NSJSONSerialization JSONObjectWithData:line options:0 error:nil];
          if ([message isKindOfClass:NSDictionary.class] && [message[@"id"] isEqual:@(responseId)]) {
            id result = message[@"result"];
            return [result isKindOfClass:NSDictionary.class] ? result : nil;
          }
          continue;
        }
        const auto left = std::chrono::duration_cast<std::chrono::milliseconds>(
            deadline - std::chrono::steady_clock::now()).count();
        pollfd descriptor{output.fileHandleForReading.fileDescriptor, POLLIN, 0};
        if (poll(&descriptor, 1, static_cast<int>(std::max<int64_t>(0, left))) <= 0) return nil;
        char buffer[8192];
        const ssize_t count = read(descriptor.fd, buffer, sizeof(buffer));
        if (count <= 0 || (receivedBytes += count) > 16 * 1024 * 1024) return nil;
        [pending appendBytes:buffer length:static_cast<NSUInteger>(count)];
      }
      return nil;
    };

    @try {
      if (request(@"initialize", @{@"clientInfo": @{@"name": @"legend_chat_history", @"version": @"1"}})) {
        send(@{@"method": @"initialized"});
        for (NSNumber* archived in @[@NO, @YES]) {
          NSString* cursor = nil;
          for (int page = 0; page < 20 && !remaining.empty(); ++page) {
            NSMutableDictionary* params = [@{@"limit": @100, @"sortKey": @"updated_at",
                @"archived": archived, @"modelProviders": @[], @"useStateDbOnly": @YES,
                @"sourceKinds": @[@"cli", @"vscode", @"exec", @"appServer", @"unknown"]} mutableCopy];
            if (cursor) params[@"cursor"] = cursor;
            NSDictionary* result = request(@"thread/list", params);
            if (![result[@"data"] isKindOfClass:NSArray.class]) break;
            for (id thread in result[@"data"]) {
              if (![thread isKindOfClass:NSDictionary.class]) continue;
              NSString* threadId = thread[@"id"];
              if (![threadId isKindOfClass:NSString.class]) continue;
              const auto found = remaining.find(threadId.UTF8String);
              if (found == remaining.end()) continue;
              NSString* name = thread[@"name"];
              NSString* preview = thread[@"preview"];
              const auto legacy = index.find(found->first);
              if ([name isKindOfClass:NSString.class] && name.length > 0) {
                found->second->title = boundedTitle(name.UTF8String);
              } else if ((legacy == index.end() || legacy->second.title.empty())
                  && [preview isKindOfClass:NSString.class] && preview.length > 0) {
                found->second->title = boundedTitle(preview.UTF8String);
              }
              remaining.erase(found);
            }
            id next = result[@"nextCursor"];
            if (![next isKindOfClass:NSString.class] || [next length] == 0 || [next isEqual:cursor]) break;
            cursor = next;
          }
        }
      }
    } @catch (NSException* exception) {
      // An unavailable/older CLI or a closed pipe leaves the index catalog intact.
    } @finally {
      [input closeFile];
      if (task.running) kill(task.processIdentifier, SIGKILL);
      [task waitUntilExit];
      [output.fileHandleForReading closeFile];
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
  // Only benchmark launches may use the isolated visual-fixture catalog.
  if (std::getenv("CHAT_HISTORY_BENCHMARK_CONFIG") != nullptr) {
    if (const char* fixtureHome = std::getenv("CHAT_HISTORY_BENCHMARK_HOME"); fixtureHome && *fixtureHome) {
      homeValue = fixtureHome;
    }
  }
  if (homeValue != nullptr && limit > 0) {
    const fs::path home(homeValue);
    std::unordered_map<std::string, CatalogMetadata> codexMetadata;
    std::unordered_map<std::string, CatalogMetadata> claudeMetadata;
    const char* codexHomeValue = std::getenv("CODEX_HOME");
    const bool fixture = std::getenv("CHAT_HISTORY_BENCHMARK_CONFIG") != nullptr;
    const fs::path codexHome = !fixture && codexHomeValue && *codexHomeValue
        ? fs::path(codexHomeValue) : home / ".codex";
    loadCodexIndex(codexHome / "session_index.jsonl", codexMetadata);

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
    addProviderFiles(codexHome / "sessions", "codex", codexMetadata, candidates);
    addProviderFiles(codexHome / "archived_sessions", "codex", codexMetadata, candidates);
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
    // Fixture catalogs stay deterministic and never launch the user's CLI.
    if (!fixture) {
      loadCodexTitles(codexHome, home, codexMetadata, summaries);
    }
  }
  return summaries;
}

} // namespace margelo::nitro::legendapps::chathistory
