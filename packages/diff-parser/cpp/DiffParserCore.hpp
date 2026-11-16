#pragma once

#include "HybridDiffDocument.hpp"

#include <functional>
#include <memory>
#include <string>
#include <string_view>
#include <vector>

namespace margelo::nitro::legendapps::diffparser {

struct DiffParsedDocument {
  std::vector<DiffFileSummary> files;
  std::vector<DiffRenderRow> rows;
  std::vector<DiffFileSources> fileSources;
  std::string repositoryPath;
  std::string workdirPath;
  std::string headTreeOid;
  DiffLoadTiming timing;
};

struct DiffRepositoryMetadata {
  std::string repositoryPath;
  std::string workdirPath;
  std::string headTreeOid;
};

struct DiffGitCompareOptions {
  std::string baseKind = "head";
  std::string baseRef;
  bool useMergeBase = true;
  bool ignoreWhitespace = false;
  // Repo-relative path prefixes matched on whole segments: ".review" excludes ".review/x", not ".reviewer".
  std::vector<std::string> excludePaths;
};

struct DiffProgressiveCallbacks {
  std::function<bool()> shouldCancel;
  std::function<void(DiffRepositoryMetadata metadata)> onRepositoryMetadata;
  std::function<void(std::vector<DiffFileSummary> files, std::vector<DiffFileSources> fileSources)> onFilesDiscovered;
  std::function<void(const DiffFileSummary& file, const DiffFileSources& fileSources, const DiffRenderRow& headerRow)> onFile;
  std::function<void(const DiffRenderRow& row)> onRow;
  std::function<void(const DiffFileSummary& file)> onFileFinished;
};

DiffParsedDocument parseUnifiedDiffText(const std::string& diffText, bool ignoreWhitespace = false);

class UnifiedDiffStreamParser {
public:
  explicit UnifiedDiffStreamParser(const DiffProgressiveCallbacks& callbacks);
  ~UnifiedDiffStreamParser();

  void append(std::string_view chunk);
  DiffLoadTiming finish();

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

DiffParsedDocument parseGitRepositoryDiff(
    const std::string& folderPath,
    bool showOnlyHunks = true,
    DiffGitCompareOptions compareOptions = {},
    std::function<bool()> shouldCancel = {});
DiffLoadTiming parseGitRepositoryDiffProgressive(
    const std::string& folderPath,
    const DiffProgressiveCallbacks& callbacks,
    bool showOnlyHunks = true,
    DiffGitCompareOptions compareOptions = {});
DiffLoadTiming parseGitRepositoryDiffProgressiveByFile(
    const std::string& folderPath,
    const DiffProgressiveCallbacks& callbacks,
    bool showOnlyHunks = true,
    DiffGitCompareOptions compareOptions = {});
std::vector<DiffSideBySideLine> createDiffSideBySideLines(const std::vector<DiffRenderRow>& rows);

struct GitHistoryCommitRow {
  std::string oid;
  std::vector<std::string> parents;
  std::string authorName;
  std::string authorEmail;
  double time = 0;
  std::string summary;
  /** The commit's graph column; `kGitGraphMaxLanes` stands for every column past the cap. */
  int lane = 0;
  /** Color index of the commit's lane. */
  int color = 0;
  /**
   * Line segments in this row as (top, bottom, color) triples: `top` is the column the segment enters
   * at the row's top edge, `bottom` the column it leaves at the bottom edge, and -1 means the commit's
   * node. A column passing through has top == bottom.
   */
  std::vector<int> edges;
};

constexpr int kGitGraphMaxLanes = 12;

/**
 * Lays out graph lanes for commits fed in `git log --topo-order` order. State carries from one row to
 * the next, so pages are laid out incrementally and a row never changes once returned.
 */
class GitGraphLayout {
public:
  /** Fills `row.lane`, `row.color` and `row.edges` from `row.oid` and `row.parents`. */
  void add(GitHistoryCommitRow& row);
  void reset();

private:
  struct Lane { std::string oid; int color = 0; bool active = false; };
  int allocate(const std::string& oid);
  std::vector<Lane> lanes_;
  int nextColor_ = 0;
};

/**
 * Walks HEAD's history in `git log --topo-order` order, in pages. The walk is anchored to the HEAD
 * commit seen when the walker opened, so pages stay consistent while refs move.
 */
class GitHistoryWalker {
public:
  explicit GitHistoryWalker(const std::string& folderPath);
  ~GitHistoryWalker();
  GitHistoryWalker(const GitHistoryWalker&) = delete;
  GitHistoryWalker& operator=(const GitHistoryWalker&) = delete;

  const std::string& headOid() const;
  bool unborn() const;
  bool detached() const;
  /** Up to `count` commits starting at `offset`; an offset other than the next one re-walks from the start. */
  std::vector<GitHistoryCommitRow> page(size_t offset, size_t count, const std::function<bool()>& shouldCancel = {});

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

} // namespace margelo::nitro::legendapps::diffparser
