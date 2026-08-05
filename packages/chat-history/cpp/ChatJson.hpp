#pragma once

#include <cstddef>
#include <functional>
#include <optional>
#include <string>
#include <string_view>

namespace margelo::nitro::legendapps::chathistory {

enum class JsonValueKind {
  Invalid,
  String,
  Object,
  Array,
  Primitive,
};

struct JsonRange {
  size_t start = 0;
  size_t end = 0;
  JsonValueKind kind = JsonValueKind::Invalid;

  bool valid() const noexcept {
    return kind != JsonValueKind::Invalid && end >= start;
  }
};

class ChatJson {
public:
  ChatJson(const char* data, size_t size) : data_(data), size_(size) {}

  std::optional<JsonRange> root(size_t start, size_t end) const;
  std::optional<JsonRange> topLevelObject(size_t start, size_t end) const;
  std::optional<JsonRange> orderedMember(
      const JsonRange& object,
      size_t& cursor,
      std::string_view key) const;
  std::optional<JsonRange> orderedTrailingMember(
      const JsonRange& object,
      size_t cursor,
      std::string_view key) const;
  std::optional<JsonRange> member(const JsonRange& object, std::string_view key) const;
  bool forEachObjectMember(
      const JsonRange& object,
      const std::function<bool(const JsonRange&, const JsonRange&)>& callback) const;
  bool forEachArrayValue(const JsonRange& array, const std::function<bool(const JsonRange&)>& callback) const;
  bool boolValue(const JsonRange& value, bool fallback = false) const;
  double numberValue(const JsonRange& value, double fallback = 0) const;
  std::string stringValue(const JsonRange& value) const;
  bool stringEquals(const JsonRange& value, std::string_view expected) const;

private:
  size_t skipWhitespace(size_t position, size_t end) const;
  std::optional<size_t> memberValueStart(size_t position, size_t end, std::string_view key) const;
  std::optional<size_t> skipString(size_t position, size_t end) const;
  std::optional<size_t> skipValue(size_t position, size_t end) const;
  JsonValueKind kindAt(size_t position) const;

  const char* data_ = nullptr;
  size_t size_ = 0;
};

} // namespace margelo::nitro::legendapps::chathistory
