#include "TreeSitterHighlighter.hpp"
#include "../vendor/tree-sitter/Symbols.h"
#include "../vendor/tree-sitter/runtime/include/tree_sitter/api.h"
#include "../vendor/tree-sitter/queries/Highlights.hpp"
#include <algorithm>
#include <exception>
#include <limits>
#include <stdexcept>
#include <tuple>
#include <mutex>
#include <map>
#include <regex>
#include <unordered_map>
#include <optional>
#include <chrono>
#include <thread>

namespace margelo::nitro::legendapps::syntaxparser {
std::string TreeSitterHighlighter::languageForPath(std::string path) {
  for (auto& c : path) if (c >= 'A' && c <= 'Z') c += 'a' - 'A';
  const auto slash = path.find_last_of("/\\");
  const auto filename = path.substr(slash == std::string::npos ? 0 : slash + 1);
  if (filename.rfind("dockerfile.", 0) == 0) return "dockerfile";
  for (const auto& entry : treeSitterFilenames) if (filename == entry.value) return entry.language;
  const auto dot = filename.find_last_of('.');
  if (dot != std::string::npos) {
    const auto extension = filename.substr(dot + 1);
    for (const auto& entry : treeSitterExtensions) if (extension == entry.value) return entry.language;
  }
  return "";
}
namespace {
std::mutex registryMutex;
struct DynamicLanguage {
  std::string name, scope, query;
  TreeSitterLanguage entry;
};
std::map<std::string, std::unique_ptr<DynamicLanguage>> dynamicLanguages;
std::vector<std::pair<std::string, std::string>>& captureCatalog() {
  static auto result = [] {
    std::vector<std::pair<std::string, std::string>> values;
    for (const auto& capture : treeSitterCaptures) values.emplace_back(capture.name, capture.scope);
    return values;
  }();
  return result;
}
const TreeSitterLanguage* findLanguage(std::string name) {
  // Language IDs/aliases are ASCII; do not depend on the process locale.
  for (auto& c : name) if (c >= 'A' && c <= 'Z') c += 'a' - 'A';
  for (const auto& alias : treeSitterCanonicalAliases) if (name == alias.name) { name = alias.canonical; break; }
  std::lock_guard lock(registryMutex);
  if (const auto found = dynamicLanguages.find(name); found != dynamicLanguages.end()) return &found->second->entry;
  for (const auto& alias : treeSitterAliases) if (name == alias.name) return &treeSitterLanguages[alias.index];
  return nullptr;
}
uint32_t bytes(uint32_t units) {
  if (units > std::numeric_limits<uint32_t>::max() / 2) throw std::length_error("Tree-sitter UTF-16 input exceeds 2 Gi code units");
  return units * 2;
}
TSPoint point(TreeSitterPoint p) { return {p.row, bytes(p.column)}; }
struct ReadState { const TreeSitterInput* input; std::exception_ptr error; };
const char* readChunk(void* payload, uint32_t offset, TSPoint, uint32_t* size) {
  auto& state = *static_cast<ReadState*>(payload);
  *size = 0;
  if (state.error || offset / 2 >= state.input->length) return nullptr;
  try {
    auto chunk = state.input->read(offset / 2);
    if (chunk.empty()) throw std::runtime_error("Premature EOF in Tree-sitter input");
    *size = bytes(static_cast<uint32_t>(std::min<size_t>(chunk.size(), state.input->length - offset / 2)));
    return reinterpret_cast<const char*>(chunk.data());
  } catch (...) { state.error = std::current_exception(); return nullptr; }
}
struct ParseBudget {
  const std::atomic_bool* cancelled;
  std::chrono::steady_clock::time_point deadline;
};
bool cancelParse(TSParseState* state) {
  const auto& budget = *static_cast<const ParseBudget*>(state->payload);
  return (budget.cancelled && budget.cancelled->load(std::memory_order_relaxed))
    || std::chrono::steady_clock::now() >= budget.deadline;
}
struct Predicate {
  std::string operation, value;
  std::vector<std::string> alternatives;
  uint32_t capture = 0;
  std::optional<std::regex> expression;
};
struct Capture { uint32_t start, end, pattern, name; };
struct Event { uint32_t offset, index; bool enter; };
using ActiveCapture = std::tuple<uint32_t, int64_t, uint32_t, uint32_t>;
using Predicates = std::vector<std::vector<Predicate>>;
std::shared_ptr<const Predicates> compilePredicates(TSQuery* query) {
  auto result = std::make_shared<Predicates>(ts_query_pattern_count(query));
  const auto text = [&](uint32_t id) {
    uint32_t size; const auto* value = ts_query_string_value_for_id(query, id, &size);
    return std::string(value, size);
  };
  for (uint32_t pattern = 0; pattern < result->size(); ++pattern) {
    uint32_t size; const auto* steps = ts_query_predicates_for_pattern(query, pattern, &size);
    for (uint32_t i = 0; i < size;) {
      Predicate p; p.operation = text(steps[i++].value_id);
      if (p.operation == "is-not?") {
        p.value = text(steps[i++].value_id);
        if (p.value != "local") throw std::runtime_error("Unsupported query property: " + p.value);
      } else if (p.operation == "any-of?" || p.operation == "has-ancestor?") {
        if (i >= size || steps[i].type != TSQueryPredicateStepTypeCapture) throw std::runtime_error("Expected any-of capture");
        p.capture = steps[i++].value_id;
        while (i < size && steps[i].type != TSQueryPredicateStepTypeDone) {
          if (steps[i].type != TSQueryPredicateStepTypeString) throw std::runtime_error("Expected any-of string");
          p.alternatives.push_back(text(steps[i++].value_id));
        }
        if (p.alternatives.empty()) throw std::runtime_error("Empty any-of predicate");
      } else if (p.operation == "match?" || p.operation == "eq?") {
        if (steps[i].type != TSQueryPredicateStepTypeCapture) throw std::runtime_error("Expected predicate capture");
        p.capture = steps[i++].value_id;
        p.value = text(steps[i++].value_id);
        if (p.operation == "match?") p.expression.emplace(p.value, std::regex::ECMAScript | std::regex::optimize);
      } else throw std::runtime_error("Unsupported query predicate: " + p.operation);
      if (i >= size || steps[i++].type != TSQueryPredicateStepTypeDone) throw std::runtime_error("Invalid query predicate arguments");
      (*result)[pattern].push_back(std::move(p));
    }
  }
  return result;
}
}
struct TreeSitterHighlighter::Impl {
  std::vector<std::string> missingLanguages;
  const TreeSitterLanguage* language = nullptr;
  TSParser* parser = ts_parser_new();
  std::shared_ptr<TSQuery> query;
  TSQueryCursor* cursor = ts_query_cursor_new();
  std::shared_ptr<TSQuery> injectionQuery;
  TSQueryCursor* injectionCursor = nullptr;
  std::vector<std::string> captures;
  std::vector<uint32_t> captureIds;
  struct Injection {
    std::string language;
    std::unique_ptr<TreeSitterHighlighter> highlighter;
    size_t revision = 0;
    uint64_t touched = 0;
  };
  std::unordered_map<const void*, Injection> injections;
  std::vector<TreeSitterEdit> injectionEdits;
  uint64_t injectionClock = 0;
  unsigned injectionDepth = 0;
  std::shared_ptr<const Predicates> predicates;
  std::vector<Capture> captureScratch;
  std::vector<Event> eventScratch;
  std::vector<ActiveCapture> activeScratch;
  TreeSitterInput input;
  // Builtin names are checked against lexical declarations lazily, only when a
  // builtin predicate is encountered. Cache per scope/tree, never across edits.
  std::unordered_map<const void*, std::vector<std::string>> bindings;
  TSTree* tree = nullptr;
  uint32_t length = 0;
  uint32_t dirtyStart = 0, dirtyEnd = UINT32_MAX;
  std::pair<uint32_t, uint32_t> invalidated{0, 0};
  bool ready = false;
  bool suspended = false;
  uint32_t suspendedLength = 0;
  ~Impl() { ts_tree_delete(tree); ts_query_cursor_delete(cursor); if (injectionCursor) ts_query_cursor_delete(injectionCursor); ts_parser_delete(parser); }
};
bool TreeSitterHighlighter::supports(const std::string& language) { return findLanguage(language) != nullptr; }
void TreeSitterHighlighter::registerPack(const LegendGrammarPackV1& pack) {
  if (pack.abi != 1 || !pack.name || !pack.scope || !pack.query || !pack.language)
    throw std::runtime_error("Invalid grammar pack descriptor");
  const auto* grammar = pack.language();
  if (!grammar) throw std::runtime_error("Grammar factory returned no language");
  const auto abi = ts_language_abi_version(grammar);
  if (abi < TREE_SITTER_MIN_COMPATIBLE_LANGUAGE_VERSION || abi > TREE_SITTER_LANGUAGE_VERSION)
    throw std::runtime_error("Incompatible grammar ABI");
  uint32_t offset = 0; TSQueryError error;
  auto query = std::unique_ptr<TSQuery, decltype(&ts_query_delete)>(
    ts_query_new(grammar, pack.query, static_cast<uint32_t>(std::string_view(pack.query).size()), &offset, &error), ts_query_delete);
  if (!query) throw std::runtime_error("Invalid pack query at " + std::to_string(offset));
  compilePredicates(query.get());
  std::lock_guard lock(registryMutex);
  // Never replace a live language/query pair. Updates take effect next launch.
  if (dynamicLanguages.count(pack.name)) return;
  for (const auto& entry : treeSitterLanguages) if (std::string_view(entry.name) == pack.name) return;
  auto value = std::make_unique<DynamicLanguage>();
  value->name = pack.name; value->scope = pack.scope; value->query = pack.query;
  const auto start = static_cast<uint32_t>(captureCatalog().size());
  for (uint32_t i = 0; i < ts_query_capture_count(query.get()); ++i) {
    uint32_t size; const auto* name = ts_query_capture_name_for_id(query.get(), i, &size);
    captureCatalog().emplace_back(std::string(name, size), value->scope);
  }
  value->entry = {value->name.c_str(), value->scope.c_str(), pack.language, value->query.c_str(), start,
    ts_query_capture_count(query.get())};
  const auto name = value->name;
  dynamicLanguages.emplace(name, std::move(value));
}
std::string TreeSitterHighlighter::themeScope(const std::string& capture) {
  const auto is = [&](const char* category) {
    const std::string_view prefix(category);
    return capture == prefix || (capture.size() > prefix.size() && capture.compare(0, prefix.size(), prefix) == 0 && capture[prefix.size()] == '.');
  };
  // Preserve standard VS Code theme compatibility, without running a TextMate
  // grammar. Specific captures must precede their broader categories.
  if (is("comment")) return "comment.block";
  if (is("string.escape") || is("escape")) return "constant.character.escape";
  if (is("string")) return "string.quoted.double";
  if (is("number")) return "constant.numeric";
  if (is("constant") || is("boolean")) return "constant.language";
  if (is("operator")) return "keyword.operator";
  if (is("keyword")) return "keyword.control";
  if (is("function.builtin")) return "support.function";
  if (is("function")) return "entity.name.function";
  if (is("type.builtin")) return "support.type";
  if (is("type") || is("constructor")) return "entity.name.type";
  if (is("tag")) return "entity.name.tag";
  if (is("attribute")) return "entity.other.attribute-name";
  if (is("variable.parameter")) return "variable.parameter";
  if (is("variable.builtin")) return "support.variable";
  if (is("property")) return "variable.other.property";
  if (is("variable")) return "variable.other.readwrite";
  if (is("punctuation")) return "punctuation";
  if (is("text.title")) return "markup.heading";
  if (is("text.strong")) return "markup.bold";
  if (is("text.emphasis")) return "markup.italic";
  if (is("text.literal")) return "markup.inline.raw";
  if (is("text.uri")) return "markup.underline.link";
  if (is("text.reference")) return "string.other.link.title";
  return {}; // Text/embedded/unknown categories inherit the document foreground.
}
TreeSitterHighlighter::TreeSitterHighlighter(const std::string& language) : impl_(std::make_unique<Impl>()) {
  impl_->language = findLanguage(language);
  if (!impl_->language) throw std::invalid_argument("Unsupported Tree-sitter language: " + language);
  const std::string canonical = impl_->language->name;
  const auto* grammar = impl_->language->grammar();
  if (!ts_parser_set_language(impl_->parser, grammar)) throw std::runtime_error("Incompatible Tree-sitter grammar ABI");
  // TSQuery is immutable; mutable cursors/parsers stay local to each worker.
  static std::mutex mutex;
  static std::map<std::string, std::shared_ptr<TSQuery>> queries;
  std::lock_guard lock(mutex);
  auto& cached = queries[canonical];
  if (!cached) {
    const std::string query = impl_->language->query;
    uint32_t offset = 0; TSQueryError error;
    cached = {ts_query_new(grammar, query.data(), static_cast<uint32_t>(query.size()), &offset, &error), ts_query_delete};
    if (!cached) throw std::runtime_error("Invalid " + canonical + " Tree-sitter query at " + std::to_string(offset) + " error " + std::to_string(error));
  }
  impl_->query = cached;
  static std::map<std::string, std::shared_ptr<const Predicates>> predicates;
  if (!predicates[canonical]) predicates[canonical] = compilePredicates(cached.get());
  impl_->predicates = predicates[canonical];
  if (canonical == "markdown" || canonical == "mdx") {
    static std::map<std::string, std::shared_ptr<TSQuery>> injections;
    auto& injection = injections[canonical];
    if (!injection) {
      const std::string source = std::string(canonical == "mdx" ? "(markdown_inline)" : "(inline)")
        + " @region (pipe_table_cell) @region (minus_metadata) @region (fenced_code_block) @region";
      uint32_t offset = 0; TSQueryError error;
      injection = {ts_query_new(grammar, source.data(), static_cast<uint32_t>(source.size()), &offset, &error), ts_query_delete};
      if (!injection) throw std::runtime_error("Invalid embedded-region query for " + canonical);
    }
    impl_->injectionQuery = injection;
    impl_->injectionCursor = ts_query_cursor_new();
  }
  for (uint32_t i = 0; i < ts_query_capture_count(cached.get()); ++i) {
    uint32_t size; const auto* name = ts_query_capture_name_for_id(cached.get(), i, &size);
    impl_->captures.emplace_back(name, size);
    const auto& entry = *impl_->language;
    uint32_t id = entry.captureOffset;
    std::lock_guard registryLock(registryMutex);
    while (id < entry.captureOffset + entry.captureCount && impl_->captures.back() != captureCatalog()[id].first) ++id;
    if (id == entry.captureOffset + entry.captureCount) throw std::runtime_error("Stale Tree-sitter capture catalog");
    impl_->captureIds.push_back(id);
  }
}
std::vector<std::string> TreeSitterHighlighter::captures() const {
  std::lock_guard lock(registryMutex);
  std::vector<std::string> result;
  for (const auto& capture : captureCatalog()) result.push_back(capture.first);
  return result;
}
size_t TreeSitterHighlighter::captureCount() {
  std::lock_guard lock(registryMutex);
  return captureCatalog().size();
}
std::string TreeSitterHighlighter::rootScopeForCapture(uint32_t capture) {
  std::lock_guard lock(registryMutex);
  if (capture >= captureCatalog().size()) throw std::out_of_range("Invalid capture ID");
  return captureCatalog()[capture].second;
}
std::string TreeSitterHighlighter::rootScope() const { return impl_->language->scope; }
TreeSitterHighlighter::~TreeSitterHighlighter() = default;
void TreeSitterHighlighter::reset() {
  impl_->injections.clear(); impl_->injectionEdits.clear();
  ts_parser_reset(impl_->parser); ts_tree_delete(impl_->tree); impl_->tree = nullptr;
  impl_->length = 0; impl_->ready = false;
  impl_->suspended = false;
  impl_->dirtyStart = 0; impl_->dirtyEnd = UINT32_MAX;
}
void TreeSitterHighlighter::edit(const TreeSitterEdit& edit) {
  if (!impl_->tree || edit.start > edit.oldEnd || edit.oldEnd > impl_->length || edit.newEnd < edit.start)
    throw std::invalid_argument("Invalid Tree-sitter edit range");
  const uint64_t length = static_cast<uint64_t>(impl_->length) - (edit.oldEnd - edit.start) + (edit.newEnd - edit.start);
  if (length > UINT32_MAX / 2) throw std::length_error("Tree-sitter document too large");
  TSInputEdit native{bytes(edit.start), bytes(edit.oldEnd), bytes(edit.newEnd), point(edit.startPoint), point(edit.oldEndPoint), point(edit.newEndPoint)};
  ts_parser_reset(impl_->parser);
  impl_->suspended = false;
  ts_tree_edit(impl_->tree, &native);
  // Apply edits lazily to a reused embedded tree only when its region is needed.
  // Bound both history and cached trees; retained row colors live in the editor.
  if (impl_->injectionEdits.size() == 256) { impl_->injections.clear(); impl_->injectionEdits.clear(); }
  impl_->injectionEdits.push_back(edit);
  const auto map = [&](uint32_t offset) {
    if (offset <= edit.start) return offset;
    if (offset >= edit.oldEnd) return offset - edit.oldEnd + edit.newEnd;
    return edit.newEnd;
  };
  impl_->dirtyStart = std::min(map(impl_->dirtyStart), edit.start);
  impl_->dirtyEnd = std::max(map(impl_->dirtyEnd), edit.newEnd);
  impl_->length = static_cast<uint32_t>(length); impl_->ready = false;
}
bool TreeSitterHighlighter::parse(const TreeSitterInput& input, const std::atomic_bool* cancelled) {
  ts_parser_reset(impl_->parser); impl_->suspended = false;
  return parseSlice(input, 0, cancelled);
}
bool TreeSitterHighlighter::parseSlice(const TreeSitterInput& input, double milliseconds, const std::atomic_bool* cancelled) {
  bytes(input.length);
  if (impl_->tree && input.length != impl_->length) throw std::invalid_argument("Call edit or reset before changing the document");
  impl_->ready = false;
  if (impl_->suspended && impl_->suspendedLength != input.length) throw std::invalid_argument("Cannot resume with a different input snapshot");
  if (!impl_->suspended) ts_parser_reset(impl_->parser);
  if (cancelled && cancelled->load(std::memory_order_relaxed)) { ts_parser_reset(impl_->parser); impl_->suspended = false; return false; }
  ReadState state{&input, {}};
  const uint16_t endian = 1;
  TSInput native{&state, readChunk, *reinterpret_cast<const uint8_t*>(&endian) ? TSInputEncodingUTF16LE : TSInputEncodingUTF16BE, nullptr};
  ParseBudget budget{cancelled, milliseconds > 0 ? std::chrono::steady_clock::now() + std::chrono::microseconds(static_cast<int64_t>(milliseconds * 1000)) : std::chrono::steady_clock::time_point::max()};
  TSParseOptions options{&budget, cancelParse};
  TSTree* next = ts_parser_parse_with_options(impl_->parser, impl_->tree, native, options);
  if (state.error) { ts_tree_delete(next); ts_parser_reset(impl_->parser); impl_->suspended = false; std::rethrow_exception(state.error); }
  if (!next || (cancelled && cancelled->load(std::memory_order_relaxed))) {
    ts_tree_delete(next);
    impl_->suspended = !cancelled || !cancelled->load(std::memory_order_relaxed);
    impl_->suspendedLength = input.length;
    if (!impl_->suspended) ts_parser_reset(impl_->parser);
    return false;
  }
  impl_->suspended = false;
  auto start = std::min(impl_->dirtyStart, input.length), end = std::min(impl_->dirtyEnd, input.length);
  if (impl_->tree) {
    uint32_t count = 0;
    auto* changed = ts_tree_get_changed_ranges(impl_->tree, next, &count);
    for (uint32_t i = 0; i < count; ++i) { start = std::min(start, changed[i].start_byte / 2); end = std::max(end, changed[i].end_byte / 2); }
    free(changed);
  } else { start = 0; end = input.length; }
  const auto root = ts_tree_root_node(next);
  const auto topLevelNode = [&](TSNode root) {
    auto node = ts_node_descendant_for_byte_range(root, bytes(start), bytes(end));
    while (!ts_node_is_null(node)) {
      // MDX nests module declarations under Markdown sections; their bindings
      // are still document-wide, including references in later sections.
      const std::string_view kind = ts_node_type(node);
      if (std::string_view(impl_->language->name) == "mdx" && (kind == "import_statement" || kind == "export_statement")) return root;
      const auto parent = ts_node_parent(node);
      if (ts_node_is_null(parent) || ts_node_eq(parent, root)) break;
      node = parent;
    }
    return node;
  };
  const auto changesProgramBindings = [&](TSNode node) {
    if (ts_node_is_null(node)) return false;
    const std::string_view kind = ts_node_type(node);
    const auto name = ts_node_child_by_field_name(node, "name", 4);
    const bool touchesName = !ts_node_is_null(name) && start <= ts_node_end_byte(name) / 2 && end >= ts_node_start_byte(name) / 2;
    return kind == "lexical_declaration" || kind == "variable_declaration" || kind == "import_statement" || kind == "export_statement"
      || ((kind == "function_declaration" || kind == "generator_function_declaration" || kind == "class_declaration") && touchesName)
      // Top-level control flow can introduce/remove function-scoped var bindings.
      || kind == "statement_block" || kind == "for_statement" || kind == "for_in_statement" || kind == "if_statement"
      || kind == "while_statement" || kind == "do_statement" || kind == "switch_statement" || kind == "try_statement";
  };
  if (start <= end) {
    auto node = topLevelNode(root);
    if (!ts_node_is_null(node)) {
      // Top-level declarations/imports can change builtin shadowing elsewhere
      // in the program. Inspect the edited old tree too: a removed declaration
      // is no longer visible in the new tree.
      if (changesProgramBindings(node) || (impl_->tree && changesProgramBindings(topLevelNode(ts_tree_root_node(impl_->tree))))) node = root;
      start = std::min(start, ts_node_start_byte(node) / 2); end = std::max(end, ts_node_end_byte(node) / 2);
    }
  }
  impl_->invalidated = {start, end};
  impl_->dirtyStart = input.length; impl_->dirtyEnd = 0;
  ts_tree_delete(impl_->tree); impl_->tree = next;
  impl_->length = input.length; impl_->ready = true;
  impl_->input = input; impl_->bindings.clear();
  return true;
}
std::pair<uint32_t, uint32_t> TreeSitterHighlighter::invalidatedRange() const { return impl_->invalidated; }
std::vector<TreeSitterSpan> TreeSitterHighlighter::highlight(uint32_t start, uint32_t end, const std::atomic_bool* cancelled) const {
  impl_->missingLanguages.clear();
  auto result = highlightBase(start, end);
  const std::string_view language = impl_->language->name;
  if ((language != "markdown" && language != "mdx") || start == end || impl_->injectionDepth >= 4) return result;
  struct Region { TSNode node; const char* language; std::vector<TSRange> ranges; };
  std::vector<Region> regions;
  const auto range = [](TSNode node) { return TSRange{ts_node_start_point(node), ts_node_end_point(node), ts_node_start_byte(node), ts_node_end_byte(node)}; };
  const auto add = [&](TSNode node, const char* target, bool excludeChildren) {
    if (!findLanguage(target)) { impl_->missingLanguages.emplace_back(target); return; }
    Region region{node, target, {}};
    auto remaining = range(node);
    if (excludeChildren) {
      for (uint32_t i = 0; i < ts_node_named_child_count(node); ++i) {
        const auto child = range(ts_node_named_child(node, i));
        if (remaining.start_byte < child.start_byte) region.ranges.push_back({remaining.start_point, child.start_point, remaining.start_byte, child.start_byte});
        remaining.start_byte = child.end_byte; remaining.start_point = child.end_point;
      }
    }
    if (remaining.start_byte < remaining.end_byte) region.ranges.push_back(remaining);
    if (!region.ranges.empty()) regions.push_back(std::move(region));
  };
  // Query only intersecting syntax. In particular, opening a document does not
  // instantiate an inline parser for every paragraph or parse every code fence.
  // A range-constrained query also skips long sibling lists inside a section;
  // enumerating every child in a manual DFS would make each viewport O(file).
  ts_query_cursor_set_byte_range(impl_->injectionCursor, bytes(start), bytes(end));
  ts_query_cursor_exec(impl_->injectionCursor, impl_->injectionQuery.get(), ts_tree_root_node(impl_->tree));
  TSQueryMatch match; uint32_t capture;
  while (ts_query_cursor_next_capture(impl_->injectionCursor, &match, &capture)) {
    if (cancelled && cancelled->load(std::memory_order_relaxed)) throw std::runtime_error("Syntax highlighting cancelled");
    const auto node = match.captures[capture].node;
    if (ts_node_end_byte(node) <= bytes(start) || ts_node_start_byte(node) >= bytes(end)) continue;
    const std::string_view type = ts_node_type(node);
    if (type == "inline" || type == "markdown_inline" || type == "pipe_table_cell") { add(node, "markdown-inline", true); continue; }
    if (type == "minus_metadata") { add(node, "yaml", false); continue; }
    if (type == "fenced_code_block") {
      TSNode content{}, info{};
      for (uint32_t i = 0; i < ts_node_named_child_count(node); ++i) {
        const auto child = ts_node_named_child(node, i);
        const std::string_view kind = ts_node_type(child);
        if (kind == "code_fence_content") content = child;
        if (kind == "info_string") info = child;
      }
      if (!ts_node_is_null(content) && !ts_node_is_null(info)) {
        // Language names are short ASCII IDs; metadata after the first word is
        // not part of the language (e.g. ```tsx title="example").
        std::string name;
        const auto limit = std::min<uint32_t>(ts_node_end_byte(info) / 2, ts_node_start_byte(info) / 2 + 64);
        for (auto at = ts_node_start_byte(info) / 2; at < limit;) {
          const auto chunk = impl_->input.read(at);
          if (chunk.empty()) throw std::runtime_error("Premature EOF in fence language");
          const char16_t c = chunk.front();
          if (c == ' ' || c == '\t' || c == '\r' || c == '\n') break;
          if (c > 127) break;
          name.push_back(static_cast<char>(c)); ++at;
        }
        if (const auto* target = findLanguage(name)) add(content, target->name, true);
        else if (!name.empty()) impl_->missingLanguages.push_back(name);
      }
      continue; // Never interpret fence contents as host Markdown/MDX.
    }
  }
  if (ts_query_cursor_did_exceed_match_limit(impl_->injectionCursor)) throw std::runtime_error("Embedded query match limit exceeded");
  std::vector<TreeSitterSpan> embedded;
  for (const auto& region : regions) {
    if (impl_->injections.size() >= 128 && !impl_->injections.count(region.node.id)) {
      const auto oldest = std::min_element(impl_->injections.begin(), impl_->injections.end(), [](const auto& a, const auto& b) { return a.second.touched < b.second.touched; });
      impl_->injections.erase(oldest);
    }
    auto& cached = impl_->injections[region.node.id];
    const bool created = !cached.highlighter || cached.language != region.language;
    if (created) {
      cached.highlighter = std::make_unique<TreeSitterHighlighter>(region.language);
      cached.language = region.language;
      cached.revision = impl_->injectionEdits.size();
      cached.highlighter->impl_->injectionDepth = impl_->injectionDepth + 1;
    }
    auto& child = *cached.highlighter;
    const bool changed = cached.revision != impl_->injectionEdits.size();
    if (!child.impl_->tree) child.reset(); // A cancelled first parse has no reusable tree.
    else for (; cached.revision < impl_->injectionEdits.size(); ++cached.revision) child.edit(impl_->injectionEdits[cached.revision]);
    cached.revision = impl_->injectionEdits.size();
    if (!ts_parser_set_included_ranges(child.impl_->parser, region.ranges.data(), static_cast<uint32_t>(region.ranges.size())))
      throw std::runtime_error("Invalid embedded language ranges");
    if (created || changed || !child.impl_->ready) {
      while (!child.parseSlice(impl_->input, 4, cancelled)) {
        if (cancelled && cancelled->load(std::memory_order_relaxed)) throw std::runtime_error("Syntax highlighting cancelled");
        std::this_thread::yield();
      }
    } else child.impl_->input = impl_->input; // Refresh the reader's lifetime even with an unchanged tree.
    cached.touched = ++impl_->injectionClock;
    // Captures such as emphasis can span excluded blockquote/list continuations.
    // Clip them back to included ranges so embedded styles cannot color markers.
    for (const auto& included : region.ranges) {
      const auto from = std::max(start, included.start_byte / 2), to = std::min(end, included.end_byte / 2);
      if (from >= to) continue;
      auto spans = child.highlight(from, to, cancelled);
      embedded.insert(embedded.end(), std::make_move_iterator(spans.begin()), std::make_move_iterator(spans.end()));
    }
  }
  if (embedded.empty()) return result;
  std::sort(embedded.begin(), embedded.end(), [](const auto& a, const auto& b) { return a.start < b.start; });
  std::vector<uint32_t> boundaries;
  for (const auto* spans : {&result, &embedded}) for (const auto& span : *spans) { boundaries.push_back(span.start); boundaries.push_back(span.start + span.length); }
  std::sort(boundaries.begin(), boundaries.end());
  boundaries.erase(std::unique(boundaries.begin(), boundaries.end()), boundaries.end());
  std::vector<TreeSitterSpan> combined;
  size_t base = 0, injection = 0;
  for (size_t i = 1; i < boundaries.size(); ++i) {
    const auto from = boundaries[i - 1], to = boundaries[i];
    while (base < result.size() && result[base].start + result[base].length <= from) ++base;
    while (injection < embedded.size() && embedded[injection].start + embedded[injection].length <= from) ++injection;
    const TreeSitterSpan* chosen = injection < embedded.size() && embedded[injection].start <= from ? &embedded[injection]
      : base < result.size() && result[base].start <= from ? &result[base] : nullptr;
    if (!chosen) continue;
    if (!combined.empty() && combined.back().start + combined.back().length == from && combined.back().captureId == chosen->captureId) combined.back().length += to - from;
    else combined.push_back({from, to - from, chosen->capture, chosen->captureId});
  }
  return combined;
}
std::vector<std::string> TreeSitterHighlighter::missingLanguages() const {
  auto result = impl_->missingLanguages;
  for (const auto& entry : impl_->injections) if (entry.second.highlighter) {
    auto nested = entry.second.highlighter->missingLanguages();
    result.insert(result.end(), nested.begin(), nested.end());
  }
  std::sort(result.begin(), result.end());
  result.erase(std::unique(result.begin(), result.end()), result.end());
  return result;
}
std::vector<TreeSitterSpan> TreeSitterHighlighter::highlightBase(uint32_t start, uint32_t end) const {
  if (!impl_->ready) throw std::logic_error("Parse must finish before highlighting");
  if (start > end || end > impl_->length) throw std::out_of_range("Invalid highlighting range");
  if (start == end) return {};
  auto* cursor = impl_->cursor;
  ts_query_cursor_set_byte_range(cursor, bytes(start), bytes(end));
  ts_query_cursor_exec(cursor, impl_->query.get(), ts_tree_root_node(impl_->tree));
  auto& captures = impl_->captureScratch; captures.clear();
  auto& events = impl_->eventScratch; events.clear();
  TSQueryMatch match; uint32_t index;
  const auto nodeText = [&](TSNode node) {
    std::string result;
    const auto end = ts_node_end_byte(node) / 2;
    for (auto offset = ts_node_start_byte(node) / 2; offset < end;) {
      auto chunk = impl_->input.read(offset);
      if (chunk.empty()) throw std::runtime_error("Premature EOF in predicate input");
      const auto count = std::min<size_t>(chunk.size(), end - offset);
      // All pinned predicates test ASCII identifiers. A non-ASCII code unit is
      // represented by a nonmatching sentinel, without lossy full-file UTF-8 conversion.
      for (size_t i = 0; i < count; ++i) result += chunk[i] < 128 ? static_cast<char>(chunk[i]) : '\x7f';
      offset += count;
    }
    return result;
  };
  const auto isFunction = [](std::string_view type) {
    return type == "function_expression" || type == "function_declaration" || type == "arrow_function"
      || type == "generator_function" || type == "generator_function_declaration" || type == "method_definition";
  };
  const auto isScope = [&](TSNode node) {
    const std::string_view type = ts_node_type(node);
    return isFunction(type) || type == "program" || type == "document" || type == "statement_block" || type == "catch_clause"
      || type == "for_statement" || type == "for_in_statement" || type == "class" || type == "class_declaration";
  };
  const auto isLocal = [&](TSNode reference) {
    const auto name = nodeText(reference);
    for (auto scope = ts_node_parent(reference); !ts_node_is_null(scope); scope = ts_node_parent(scope)) {
      if (!isScope(scope)) continue;
      auto found = impl_->bindings.find(scope.id);
      if (found == impl_->bindings.end()) {
        std::vector<std::string> names;
        const auto field = [](TSNode node, const char* name) { return ts_node_child_by_field_name(node, name, static_cast<uint32_t>(std::char_traits<char>::length(name))); };
        const auto bind = [&](TSNode pattern) {
          std::vector<TSNode> patterns;
          if (!ts_node_is_null(pattern)) patterns.push_back(pattern);
          while (!patterns.empty()) {
            const auto node = patterns.back(); patterns.pop_back();
            if (ts_node_is_null(node)) continue;
            const std::string_view type = ts_node_type(node);
            if (type == "identifier" || type == "type_identifier" || type == "shorthand_property_identifier_pattern") names.push_back(nodeText(node));
            else if (type == "pair_pattern") patterns.push_back(field(node, "value"));
            else if (type == "assignment_pattern" || type == "object_assignment_pattern") patterns.push_back(field(node, "left"));
            else if (type == "required_parameter" || type == "optional_parameter") {
              const auto name = field(node, "pattern");
              if (!ts_node_is_null(name)) patterns.push_back(name);
            } else if (type == "array_pattern" || type == "object_pattern" || type == "rest_pattern" || type == "formal_parameters") {
              for (uint32_t child = 0; child < ts_node_named_child_count(node); ++child) patterns.push_back(ts_node_named_child(node, child));
            }
            // Deliberately do not descend into default expressions, type
            // annotations, or destructuring keys: those are not bindings.
          }
        };
        const std::string_view scopeType = ts_node_type(scope);
        if (isFunction(scopeType)) { bind(field(scope, "name")); bind(field(scope, "parameters")); bind(field(scope, "parameter")); }
        if (scopeType == "catch_clause") bind(field(scope, "parameter"));
        if (scopeType == "class" || scopeType == "class_declaration") bind(field(scope, "name"));
        const bool hoistVars = scopeType == "program" || scopeType == "document" || isFunction(scopeType);
        struct Pending { TSNode node; bool hoistedOnly; };
        std::vector<Pending> pending{{scope, false}};
        while (!pending.empty()) {
          auto [node, hoistedOnly] = pending.back(); pending.pop_back();
          const std::string_view type = ts_node_type(node);
          if (node.id != scope.id && isScope(node)) {
            if (!hoistedOnly && (type == "function_declaration" || type == "generator_function_declaration" || type == "class_declaration")) bind(field(node, "name"));
            // var declarations belong to the nearest function/program even
            // through blocks. Never cross a nested function or class boundary.
            if (!hoistVars || isFunction(type) || type == "class" || type == "class_declaration") continue;
            hoistedOnly = true;
          }
          if (type == "variable_declarator") {
            const auto parent = ts_node_parent(node);
            const std::string_view parentType = ts_node_type(parent);
            if (!hoistedOnly || parentType == "variable_declaration") bind(field(node, "name"));
          } else if (!hoistedOnly && type == "import_specifier") {
            const auto alias = field(node, "alias");
            bind(ts_node_is_null(alias) ? field(node, "name") : alias);
            continue;
          } else if (!hoistedOnly && (type == "import_clause" || type == "namespace_import")) {
            for (uint32_t child = 0; child < ts_node_named_child_count(node); ++child) {
              const auto name = ts_node_named_child(node, child);
              if (std::string_view(ts_node_type(name)) == "identifier") bind(name);
            }
          } else if (type == "for_in_statement") {
            const auto kind = field(node, "kind");
            if (!ts_node_is_null(kind) && (!hoistedOnly || nodeText(kind) == "var")) bind(field(node, "left"));
          }
          for (uint32_t child = 0; child < ts_node_named_child_count(node); ++child) pending.push_back({ts_node_named_child(node, child), hoistedOnly});
        }
        found = impl_->bindings.emplace(scope.id, std::move(names)).first;
      }
      if (std::find(found->second.begin(), found->second.end(), name) != found->second.end()) return true;
    }
    return false;
  };
  uint32_t checkedMatch = UINT32_MAX; bool accepted = false;
  while (ts_query_cursor_next_capture(cursor, &match, &index)) {
    if (checkedMatch != match.id) {
      checkedMatch = match.id; accepted = true;
      for (const auto& predicate : (*impl_->predicates)[match.pattern_index]) {
        if (predicate.operation == "is-not?") {
          if (isLocal(match.captures[0].node)) { accepted = false; break; }
        } else {
          for (uint16_t c = 0; c < match.capture_count; ++c) {
            if (match.captures[c].index != predicate.capture) continue;
            const auto value = nodeText(match.captures[c].node);
            if (predicate.operation == "has-ancestor?") {
              bool found = false;
              for (auto parent = ts_node_parent(match.captures[c].node); !ts_node_is_null(parent); parent = ts_node_parent(parent)) {
                if (std::find(predicate.alternatives.begin(), predicate.alternatives.end(), ts_node_type(parent)) != predicate.alternatives.end()) { found = true; break; }
              }
              if (!found) accepted = false;
            } else if (predicate.operation == "any-of?") {
              if (std::find(predicate.alternatives.begin(), predicate.alternatives.end(), value) == predicate.alternatives.end()) accepted = false;
            } else if (predicate.expression ? !std::regex_search(value, *predicate.expression) : value != predicate.value) accepted = false;
          }
        }
        if (!accepted) break;
      }
    }
    if (!accepted) continue;
    auto capture = match.captures[index];
    const auto from = ts_node_start_byte(capture.node) / 2, to = ts_node_end_byte(capture.node) / 2;
    // Error recovery can produce zero-width missing nodes. They must not leave
    // a phantom active capture after equal-position sweep events.
    if (from >= to || to <= start || from >= end) continue;
    const auto id = static_cast<uint32_t>(captures.size());
    captures.push_back({from, to, match.pattern_index, capture.index});
    events.push_back({std::max(from, start), id, true}); events.push_back({std::min(to, end), id, false});
  }
  if (ts_query_cursor_did_exceed_match_limit(cursor)) throw std::runtime_error("Tree-sitter query match limit exceeded");
  std::sort(events.begin(), events.end(), [](const Event& a, const Event& b) { return a.offset < b.offset; });
  // Innermost capture first, then latest query pattern for equal node ranges.
  // Nesting is shallow; retained contiguous storage avoids a node allocation
  // per capture while preserving the exact overlap precedence.
  auto& active = impl_->activeScratch; active.clear();
  std::vector<TreeSitterSpan> result;
  uint32_t position = start;
  for (const auto& event : events) {
    if (position < event.offset && !active.empty()) {
      const auto& capture = captures[std::get<3>(active.back())];
      const auto& label = impl_->captures[capture.name];
      if (!result.empty() && result.back().start + result.back().length == position && result.back().capture == label)
        result.back().length += event.offset - position;
      else result.push_back({position, event.offset - position, label, impl_->captureIds[capture.name]});
    }
    position = event.offset;
    const auto& c = captures[event.index];
    const auto key = std::make_tuple(c.start, -static_cast<int64_t>(c.end), c.pattern, event.index);
    const auto at = std::lower_bound(active.begin(), active.end(), key);
    if (event.enter) active.insert(at, key);
    else if (at != active.end() && *at == key) active.erase(at);
  }
  return result;
}
}
