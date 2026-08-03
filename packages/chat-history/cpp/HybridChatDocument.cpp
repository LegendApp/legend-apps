#include "HybridChatDocument.hpp"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <sstream>
#include <stdexcept>

namespace margelo::nitro::legendapps::chathistory {

namespace {

std::string visibleUserMarkdown(const ChatRow& row, std::string markdown) {
  constexpr std::string_view filesHeading = "# Files mentioned by the user:";
  constexpr std::string_view requestHeading = "## My request for Codex:";
  const size_t firstContent = markdown.find_first_not_of("\r\n");
  if (row.kind == "user"
      && (!row.imageSources.empty() || row.hasImagePlaceholder)
      && firstContent != std::string::npos
      && markdown.compare(firstContent, filesHeading.size(), filesHeading) == 0) {
    const size_t request = markdown.find(requestHeading, firstContent + filesHeading.size());
    if (request != std::string::npos) {
      size_t content = request + requestHeading.size();
      while (content < markdown.size() && (markdown[content] == '\r' || markdown[content] == '\n')) {
        content += 1;
      }
      markdown.erase(0, content);
    }
  }
  return markdown;
}

std::string toolActivityLabel(const ChatRow& row) {
  std::string name = row.toolName;
  std::transform(name.begin(), name.end(), name.begin(), [](unsigned char character) {
    return static_cast<char>(std::tolower(character));
  });

  std::string label;
  if (name.find("exec") != std::string::npos
      || name.find("shell") != std::string::npos
      || name.find("command") != std::string::npos
      || name.find("bash") != std::string::npos) {
    label = "Ran a command";
  } else if (name.find("agent") != std::string::npos) {
    label = "Worked with an agent";
  } else if (name.find("patch") != std::string::npos
      || name.find("write") != std::string::npos
      || name.find("edit") != std::string::npos) {
    label = "Edited files";
  } else if (name.find("read") != std::string::npos
      || name.find("open") != std::string::npos
      || name.find("find") != std::string::npos
      || name.find("glob") != std::string::npos
      || name.find("grep") != std::string::npos) {
    label = "Read files";
  } else if (name.find("web") != std::string::npos
      || name.find("search") != std::string::npos
      || name.find("browser") != std::string::npos) {
    label = "Searched the web";
  } else if (name.find("image") != std::string::npos) {
    label = "Created an image";
  } else {
    std::replace(name.begin(), name.end(), '_', ' ');
    std::replace(name.begin(), name.end(), '-', ' ');
    label = name.empty() ? "Used a tool" : "Used " + name;
  }

  if (row.toolStatus == "failed") {
    label.append(" (failed)");
  }
  return label;
}

} // namespace

HybridChatDocument::HybridChatDocument(
    std::string documentId,
    ChatParseResult result,
    ChatDocumentTiming timing)
    : HybridObject(TAG),
      documentId_(std::move(documentId)),
      source_(std::move(result.source)),
      rows_(std::move(result.rows)),
      warningCount_(result.warningCount),
      timing_(timing) {
  buildDisplayRows();
}

HybridChatDocument::~HybridChatDocument() {
  ChatDocumentRegistry::shared().unregisterDocument(documentId_);
}

std::string HybridChatDocument::getDocumentId() {
  return documentId_;
}

double HybridChatDocument::getRowCount() {
  return static_cast<double>(displayRows_.size());
}

double HybridChatDocument::getWarningCount() {
  return static_cast<double>(warningCount_);
}

size_t HybridChatDocument::checkedIndex(double index) const {
  if (!std::isfinite(index) || index < 0 || std::floor(index) != index || static_cast<size_t>(index) >= displayRows_.size()) {
    throw std::out_of_range("Chat row index is out of range");
  }
  return static_cast<size_t>(index);
}

size_t HybridChatDocument::checkedFileIndex(const ChatRow& row, double fileIndex) const {
  if (!std::isfinite(fileIndex)
      || fileIndex < 0
      || std::floor(fileIndex) != fileIndex
      || static_cast<size_t>(fileIndex) >= row.fileChanges.size()) {
    throw std::out_of_range("Chat file index is out of range");
  }
  return static_cast<size_t>(fileIndex);
}

size_t HybridChatDocument::checkedImageIndex(const ChatRow& row, double imageIndex) const {
  if (!std::isfinite(imageIndex)
      || imageIndex < 0
      || std::floor(imageIndex) != imageIndex
      || static_cast<size_t>(imageIndex) >= row.imageSources.size()) {
    throw std::out_of_range("Chat image index is out of range");
  }
  return static_cast<size_t>(imageIndex);
}

void HybridChatDocument::buildDisplayRows() {
  size_t index = 0;
  while (index < rows_.size()) {
    if (rows_[index].kind == "user") {
      displayRows_.push_back(ChatDisplayRow{index, 1, false});
      index += 1;
    } else {
      size_t turnEnd = index;
      size_t lastTool = rows_.size();
      while (turnEnd < rows_.size() && rows_[turnEnd].kind != "user") {
        if (rows_[turnEnd].kind == "tool") {
          lastTool = turnEnd;
        }
        turnEnd += 1;
      }

      if (lastTool < turnEnd) {
        displayRows_.push_back(ChatDisplayRow{index, lastTool - index + 1, true});
        index = lastTool + 1;
      } else {
        displayRows_.push_back(ChatDisplayRow{index, 1, false});
        index += 1;
      }
    }
  }
}

std::string HybridChatDocument::workGroupLabel(const ChatDisplayRow& displayRow) const {
  double startedAtMs = 0;
  double endedAtMs = 0;
  for (size_t offset = 0; offset < displayRow.rowCount; offset += 1) {
    const ChatRow& row = rows_[displayRow.firstRow + offset];
    if (row.startedAtMs > 0 && (startedAtMs == 0 || row.startedAtMs < startedAtMs)) {
      startedAtMs = row.startedAtMs;
    }
    endedAtMs = std::max(endedAtMs, row.endedAtMs);
  }

  std::string label = "Worked";
  if (startedAtMs > 0 && endedAtMs >= startedAtMs) {
    const size_t elapsedSeconds = std::max<size_t>(1, static_cast<size_t>(std::llround((endedAtMs - startedAtMs) / 1000)));
    const size_t hours = elapsedSeconds / 3600;
    const size_t minutes = (elapsedSeconds % 3600) / 60;
    const size_t seconds = elapsedSeconds % 60;
    std::ostringstream duration;
    if (hours > 0) {
      duration << hours << "h";
      if (minutes > 0) {
        duration << " " << minutes << "m";
      }
    } else if (minutes > 0) {
      duration << minutes << "m";
      if (seconds > 0) {
        duration << " " << seconds << "s";
      }
    } else {
      duration << seconds << "s";
    }
    label.append(" for ").append(duration.str());
  }
  return label;
}

std::string HybridChatDocument::workGroupStatus(const ChatDisplayRow& displayRow) const {
  std::string status = "completed";
  for (size_t offset = 0; offset < displayRow.rowCount; offset += 1) {
    const ChatRow& row = rows_[displayRow.firstRow + offset];
    if (row.kind == "tool" && row.toolStatus == "failed") {
      status = "failed";
      break;
    }
    if (row.kind == "tool" && row.toolStatus != "completed") {
      status = "unknown";
    }
  }
  return status;
}

ChatRowMetadata HybridChatDocument::getRowMetadata(double index) {
  const size_t displayIndex = checkedIndex(index);
  const ChatDisplayRow& displayRow = displayRows_[displayIndex];
  const ChatRow& row = rows_[displayRow.firstRow];
  if (displayRow.isWorkGroup) {
    return ChatRowMetadata(
        index,
        "tool",
        std::nullopt,
        workGroupLabel(displayRow),
        workGroupStatus(displayRow),
        true,
        false,
        0,
        std::nullopt,
        std::nullopt,
        std::nullopt);
  }
  const bool hasMarkdown = !row.markdownRanges.empty();
  size_t fileAdditions = 0;
  size_t fileDeletions = 0;
  for (const ChatRow::FileChange& file : row.fileChanges) {
    fileAdditions += file.additions;
    fileDeletions += file.deletions;
  }
  const bool hasFiles = !row.fileChanges.empty();
  return ChatRowMetadata(
      index,
      row.kind,
      hasMarkdown ? std::optional<std::string>(markdownBlockId(documentId_, displayIndex)) : std::nullopt,
      row.toolName.empty() ? std::nullopt : std::optional<std::string>(row.toolName),
      row.toolStatus.empty() ? std::nullopt : std::optional<std::string>(row.toolStatus),
      !row.previewRanges.empty(),
      row.hasImagePlaceholder,
      static_cast<double>(row.imageSources.size()),
      hasFiles ? std::optional<double>(row.fileChanges.size()) : std::nullopt,
      hasFiles ? std::optional<double>(fileAdditions) : std::nullopt,
      hasFiles ? std::optional<double>(fileDeletions) : std::nullopt);
}

std::string HybridChatDocument::decodeRanges(const std::vector<JsonRange>& ranges, size_t maximumBytes) const {
  std::shared_ptr<const ChatSource> source;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    source = source_;
  }

  std::string output;
  if (source) {
    const ChatJson json(source->data(), source->size());
    for (const JsonRange& range : ranges) {
      std::string part = json.stringValue(range);
      if (!part.empty()) {
        if (!output.empty()) {
          output.append("\n\n");
        }
        const size_t available = maximumBytes == 0 || output.size() < maximumBytes ? maximumBytes - std::min(maximumBytes, output.size()) : 0;
        if (maximumBytes == 0 || part.size() <= available) {
          output.append(part);
        } else {
          output.append(part.data(), available);
          break;
        }
      }
      if (maximumBytes > 0 && output.size() >= maximumBytes) {
        break;
      }
    }
  }
  return output;
}

std::string HybridChatDocument::markdownForRow(size_t index) {
  std::string markdown;
  if (index < displayRows_.size()) {
    const ChatRow& row = rows_[displayRows_[index].firstRow];
    markdown = visibleUserMarkdown(row, decodeRanges(row.markdownRanges));
  }
  return markdown;
}

void HybridChatDocument::setTiming(ChatDocumentTiming timing) {
  timing_ = timing;
}

std::string HybridChatDocument::getToolPreview(double index, double maximumBytes) {
  const size_t displayIndex = checkedIndex(index);
  const size_t boundedBytes = std::clamp<size_t>(
      std::isfinite(maximumBytes) && maximumBytes > 0 ? static_cast<size_t>(maximumBytes) : 0,
      0,
      64 * 1024);
  if (boundedBytes == 0) {
    return std::string();
  }
  const ChatDisplayRow& displayRow = displayRows_[displayIndex];
  return displayRow.isWorkGroup
      ? workGroupPreview(displayRow, boundedBytes)
      : decodeRanges(rows_[displayRow.firstRow].previewRanges, boundedBytes);
}

std::string HybridChatDocument::getImageSource(double index, double imageIndex) {
  const ChatDisplayRow& displayRow = displayRows_[checkedIndex(index)];
  const ChatRow& row = rows_[displayRow.firstRow];
  return row.imageSources[checkedImageIndex(row, imageIndex)];
}

ChatFileChange HybridChatDocument::getFileChange(double index, double fileIndex) {
  const ChatDisplayRow& displayRow = displayRows_[checkedIndex(index)];
  const ChatRow& row = rows_[displayRow.firstRow];
  const ChatRow::FileChange& file = row.fileChanges[checkedFileIndex(row, fileIndex)];
  return ChatFileChange(
      file.path,
      static_cast<double>(file.additions),
      static_cast<double>(file.deletions));
}

std::string HybridChatDocument::workGroupPreview(
    const ChatDisplayRow& displayRow,
    size_t maximumBytes) const {
  constexpr size_t maximumEntryBytes = 4 * 1024;
  std::string output;
  std::vector<std::string> pendingActivities;
  const auto appendPart = [&](const std::string& part) {
    if (!part.empty() && output.size() < maximumBytes) {
      if (!output.empty()) {
        const size_t separatorBytes = std::min<size_t>(2, maximumBytes - output.size());
        output.append("\n\n", separatorBytes);
      }
      const size_t available = maximumBytes - output.size();
      output.append(part.data(), std::min(part.size(), available));
    }
  };
  const auto flushActivities = [&]() {
    std::string summary;
    for (const std::string& activity : pendingActivities) {
      if (!summary.empty()) {
        summary.append(", ");
      }
      if (summary.empty() || activity.empty()) {
        summary.append(activity);
      } else {
        std::string continuation = activity;
        continuation[0] = static_cast<char>(std::tolower(static_cast<unsigned char>(continuation[0])));
        summary.append(continuation);
      }
    }
    appendPart(summary);
    pendingActivities.clear();
  };

  for (size_t offset = 0; offset < displayRow.rowCount && output.size() < maximumBytes; offset += 1) {
    const ChatRow& row = rows_[displayRow.firstRow + offset];
    if (row.kind == "tool") {
      const std::string activity = toolActivityLabel(row);
      if (std::find(pendingActivities.begin(), pendingActivities.end(), activity) == pendingActivities.end()) {
        pendingActivities.push_back(activity);
      }
      continue;
    }

    flushActivities();
    if (!row.markdownRanges.empty()) {
      appendPart(decodeRanges(row.markdownRanges, maximumEntryBytes));
    }
    if (row.hasImagePlaceholder) {
      appendPart("Image or attachment omitted");
    }
  }
  flushActivities();
  return output;
}

ChatDocumentTiming HybridChatDocument::getTiming() {
  return timing_;
}

double HybridChatDocument::releaseNativeResources() {
  std::lock_guard<std::mutex> lock(mutex_);
  const size_t releasedBytes = source_ ? source_->externalMemorySize() : 0;
  source_.reset();
  ChatDocumentRegistry::shared().unregisterDocument(documentId_);
  return static_cast<double>(releasedBytes);
}

size_t HybridChatDocument::getExternalMemorySize() noexcept {
  std::lock_guard<std::mutex> lock(mutex_);
  return (source_ ? source_->externalMemorySize() : 0)
      + rows_.capacity() * sizeof(ChatRow)
      + displayRows_.capacity() * sizeof(ChatDisplayRow);
}

} // namespace margelo::nitro::legendapps::chathistory
