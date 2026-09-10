#pragma once

#include <algorithm>
#include <cstdint>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace legend::source {

// UTF-16 is the native input protocol's coordinate system. Line terminators are
// kept verbatim, including CRLF; a final newline always creates an empty line.
struct Line {
  uint64_t id;
  std::u16string text;
  std::u16string ending;
  size_t size() const { return text.size() + ending.size(); }
};

struct Position {
  size_t line;
  size_t column;
};

struct Change {
  size_t startLine;
  size_t removedLineCount;
  std::vector<Line> lines;
  size_t offset;
  std::u16string removedText;
  std::u16string insertedText;
  uint64_t revision;
};

// An implicit treap of logical lines. Subtree UTF-16 lengths and line counts
// provide logarithmic position lookup and structural edits without renumbering
// or copying every subsequent line. Characters within one line remain a string;
// extremely long lines are deliberately covered by the prototype benchmark.
class SourceDocument {
  struct Node;
  using Tree = std::unique_ptr<Node>;
  struct Node {
    Line line;
    uint64_t priority;
    Tree left;
    Tree right;
    size_t count = 1;
    size_t units;
    Node(Line value, uint64_t rank) : line(std::move(value)), priority(rank), units(line.size()) {}
  };

  Tree root_;
  uint64_t nextId_ = 1;
  uint64_t revision_ = 0;
  uint64_t random_ = 0x9e3779b97f4a7c15ULL;

  static size_t count(const Tree &tree) { return tree ? tree->count : 0; }
  static size_t units(const Tree &tree) { return tree ? tree->units : 0; }
  static void update(Node &node) {
    node.count = 1 + count(node.left) + count(node.right);
    node.units = units(node.left) + node.line.size() + units(node.right);
  }
  uint64_t priority() {
    random_ ^= random_ << 13;
    random_ ^= random_ >> 7;
    random_ ^= random_ << 17;
    return random_;
  }
  static Tree merge(Tree left, Tree right) {
    if (!left) return right;
    if (!right) return left;
    if (left->priority > right->priority) {
      left->right = merge(std::move(left->right), std::move(right));
      update(*left);
      return left;
    }
    right->left = merge(std::move(left), std::move(right->left));
    update(*right);
    return right;
  }
  static std::pair<Tree, Tree> split(Tree tree, size_t at) {
    if (!tree) return {};
    const auto leftCount = count(tree->left);
    if (at <= leftCount) {
      auto parts = split(std::move(tree->left), at);
      tree->left = std::move(parts.second);
      update(*tree);
      return {std::move(parts.first), std::move(tree)};
    }
    auto parts = split(std::move(tree->right), at - leftCount - 1);
    tree->right = std::move(parts.first);
    update(*tree);
    return {std::move(tree), std::move(parts.second)};
  }
  std::vector<Line> parse(const std::u16string &text) {
    std::vector<Line> result;
    size_t start = 0;
    for (size_t i = 0; i < text.size(); ++i) {
      if (text[i] != u'\n' && text[i] != u'\r') continue;
      const auto length = text[i] == u'\r' && i + 1 < text.size() && text[i + 1] == u'\n' ? 2 : 1;
      result.push_back({nextId_++, text.substr(start, i - start), text.substr(i, length)});
      i += length - 1;
      start = i + 1;
    }
    result.push_back({nextId_++, text.substr(start), u""});
    return result;
  }
  Tree treeFor(std::vector<Line> lines) {
    // Linear Cartesian-tree construction; repeated merge is O(n log n).
    Tree tree;
    std::vector<Node *> stack;
    for (auto &line : lines) {
      auto node = std::make_unique<Node>(std::move(line), priority());
      Node *raw = node.get();
      while (!stack.empty() && stack.back()->priority < node->priority) {
        update(*stack.back()); stack.pop_back();
      }
      if (stack.empty()) { node->left = std::move(tree); tree = std::move(node); }
      else { node->left = std::move(stack.back()->right); stack.back()->right = std::move(node); }
      stack.push_back(raw);
    }
    while (!stack.empty()) { update(*stack.back()); stack.pop_back(); }
    return tree;
  }
  static void append(const Node *node, size_t base, size_t start, size_t end, std::u16string &output) {
    if (!node || end <= base || start >= base + node->units) return;
    const auto at = base + units(node->left);
    append(node->left.get(), base, start, end, output);
    const auto lineEnd = at + node->line.size();
    if (start < lineEnd && end > at) {
      const auto text = node->line.text + node->line.ending;
      const auto begin = start > at ? start - at : 0;
      output.append(text, begin, std::min(end, lineEnd) - at - begin);
    }
    append(node->right.get(), lineEnd, start, end, output);
  }

public:
  explicit SourceDocument(const std::u16string &source = u"", uint64_t firstId = 1) {
    nextId_ = firstId;
    random_ ^= firstId * 2654435761ULL;
    root_ = treeFor(parse(source));
  }
  // File rows use small monotonic IDs; edits have a separate safe-in-JS range.
  void useEditIdRange() { nextId_ = std::max(nextId_, uint64_t{1} << 40); }

  struct LoadedAppend {
    size_t startLine;
    uint64_t retainedId, firstId;
    size_t count;
    uint64_t revision;
    std::optional<Change> fallback;
  };

  LoadedAppend appendLoaded(SourceDocument &&chunk) {
    const auto start = lineCount() - 1;
    const auto retained = line(start).id;
    const auto added = chunk.lineCount() - 1;
    const auto firstId = added ? chunk.line(1).id : 1;
    // An edit at the current EOF can create a CR/LF join with arriving data.
    // Use the normal bounded boundary reparse for that rare case.
    if (lineCount() > 1 && line(start).text.empty() && line(start - 1).ending == u"\r"
      && chunk.line(0).text.empty() && chunk.line(0).ending.starts_with(u"\n")) {
      auto change = replace(length(), 0, chunk.text());
      const auto revision = change.revision;
      return {start, retained, firstId, added, revision, std::move(change)};
    }
    auto head = split(std::move(root_), start);
    auto tail = split(std::move(chunk.root_), 1);
    // Last and first are single-node trees. Preserve the editable EOF's ID and
    // any edits made there while subsequent file bytes were loading.
    head.second->line.text += tail.first->line.text;
    head.second->line.ending = std::move(tail.first->line.ending);
    update(*head.second);
    root_ = merge(merge(std::move(head.first), std::move(head.second)), std::move(tail.second));
    nextId_ = std::max(nextId_, chunk.nextId_);
    return {start, retained, firstId, added, ++revision_, std::nullopt};
  }
  size_t lineCount() const { return count(root_); }
  size_t length() const { return units(root_); }
  uint64_t revision() const { return revision_; }

  const Line &line(size_t index) const {
    if (index >= lineCount()) throw std::out_of_range("source line");
    auto *node = root_.get();
    while (node) {
      const auto leftCount = count(node->left);
      if (index == leftCount) return node->line;
      if (index < leftCount) node = node->left.get();
      else { index -= leftCount + 1; node = node->right.get(); }
    }
    throw std::logic_error("invalid source tree");
  }

  size_t lineOffset(size_t index) const {
    if (index >= lineCount()) throw std::out_of_range("source line offset");
    auto *node = root_.get();
    size_t offset = 0;
    while (node) {
      const auto leftCount = count(node->left);
      if (index == leftCount) return offset + units(node->left);
      if (index < leftCount) node = node->left.get();
      else {
        offset += units(node->left) + node->line.size();
        index -= leftCount + 1;
        node = node->right.get();
      }
    }
    throw std::logic_error("invalid source tree");
  }

  Position position(size_t offset) const {
    if (offset > length()) throw std::out_of_range("source position");
    auto *node = root_.get();
    size_t index = 0;
    while (node) {
      const auto leftUnits = units(node->left);
      if (offset < leftUnits) { node = node->left.get(); continue; }
      offset -= leftUnits;
      index += count(node->left);
      if (offset < node->line.size() || !node->right) return {index, offset};
      offset -= node->line.size();
      ++index;
      node = node->right.get();
    }
    throw std::logic_error("invalid source tree");
  }

  std::u16string slice(size_t offset, size_t length) const {
    if (offset > this->length() || length > this->length() - offset) throw std::out_of_range("source slice");
    std::u16string result;
    result.reserve(length);
    append(root_.get(), 0, offset, offset + length, result);
    return result;
  }
  std::u16string text() const { return slice(0, length()); }

  Change replace(size_t offset, size_t removedLength, const std::u16string &inserted) {
    if (offset > length() || removedLength > length() - offset) throw std::out_of_range("source edit");
    const auto first = position(offset);
    const auto last = position(offset + removedLength);
    // Include a neighboring line on either side: edits may split a CRLF pair or
    // create one across a boundary. Reparsing this bounded context keeps line
    // indexing correct without normalizing the source.
    const auto begin = first.line > 0 ? first.line - 1 : 0;
    const auto end = std::min(lineCount(), last.line + 2);
    const auto startOffset = lineOffset(begin);
    const auto endOffset = end == lineCount() ? length() : lineOffset(end);
    auto local = slice(startOffset, endOffset - startOffset);
    Change change{begin, end - begin, {}, offset, slice(offset, removedLength), inserted, revision_};
    local.replace(offset - startOffset, removedLength, inserted);
    auto replacement = parse(local);
    if (end < lineCount()) replacement.pop_back(); // trailing boundary belongs to next subtree

    // Keep unchanged prefix/suffix rows, and reuse the edited first row's ID.
    size_t prefix = 0;
    while (prefix < replacement.size() && prefix < end - begin) {
      const auto &old = line(begin + prefix);
      if (old.text != replacement[prefix].text || old.ending != replacement[prefix].ending) break;
      replacement[prefix].id = old.id;
      ++prefix;
    }
    size_t suffix = 0;
    while (suffix + prefix < replacement.size() && suffix + prefix < end - begin) {
      const auto &old = line(end - suffix - 1);
      auto &next = replacement[replacement.size() - suffix - 1];
      if (old.text != next.text || old.ending != next.ending) break;
      next.id = old.id;
      ++suffix;
    }
    if (prefix + suffix < replacement.size() && prefix + suffix < end - begin) {
      replacement[prefix].id = line(begin + prefix).id;
    }
    auto head = split(std::move(root_), begin);
    auto tail = split(std::move(head.second), end - begin);
    root_ = merge(merge(std::move(head.first), treeFor(replacement)), std::move(tail.second));
    change.lines = std::move(replacement);
    change.revision = ++revision_;
    return change;
  }
};

} // namespace legend::source
