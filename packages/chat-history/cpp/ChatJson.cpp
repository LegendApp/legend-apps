#include "ChatJson.hpp"

#include <algorithm>
#include <cstdint>
#include <cstdlib>

namespace margelo::nitro::legendapps::chathistory {

namespace {

int hexValue(char value) {
  if (value >= '0' && value <= '9') {
    return value - '0';
  }
  if (value >= 'a' && value <= 'f') {
    return value - 'a' + 10;
  }
  if (value >= 'A' && value <= 'F') {
    return value - 'A' + 10;
  }
  return -1;
}

void appendUtf8(std::string& output, uint32_t codepoint) {
  if (codepoint <= 0x7f) {
    output.push_back(static_cast<char>(codepoint));
  } else if (codepoint <= 0x7ff) {
    output.push_back(static_cast<char>(0xc0 | (codepoint >> 6)));
    output.push_back(static_cast<char>(0x80 | (codepoint & 0x3f)));
  } else if (codepoint <= 0xffff) {
    output.push_back(static_cast<char>(0xe0 | (codepoint >> 12)));
    output.push_back(static_cast<char>(0x80 | ((codepoint >> 6) & 0x3f)));
    output.push_back(static_cast<char>(0x80 | (codepoint & 0x3f)));
  } else {
    output.push_back(static_cast<char>(0xf0 | (codepoint >> 18)));
    output.push_back(static_cast<char>(0x80 | ((codepoint >> 12) & 0x3f)));
    output.push_back(static_cast<char>(0x80 | ((codepoint >> 6) & 0x3f)));
    output.push_back(static_cast<char>(0x80 | (codepoint & 0x3f)));
  }
}

} // namespace

size_t ChatJson::skipWhitespace(size_t position, size_t end) const {
  const size_t boundedEnd = std::min(end, size_);
  while (position < boundedEnd) {
    const char value = data_[position];
    if (value != ' ' && value != '\t' && value != '\r' && value != '\n') {
      break;
    }
    position += 1;
  }
  return position;
}

std::optional<size_t> ChatJson::skipString(size_t position, size_t end) const {
  const size_t boundedEnd = std::min(end, size_);
  if (position >= boundedEnd || data_[position] != '"') {
    return std::nullopt;
  }

  position += 1;
  while (position < boundedEnd) {
    const char value = data_[position++];
    if (value == '"') {
      return position;
    }
    if (value == '\\') {
      if (position >= boundedEnd) {
        return std::nullopt;
      }
      position += 1;
    } else if (static_cast<unsigned char>(value) < 0x20) {
      return std::nullopt;
    }
  }
  return std::nullopt;
}

std::optional<size_t> ChatJson::skipValue(size_t position, size_t end) const {
  const size_t boundedEnd = std::min(end, size_);
  position = skipWhitespace(position, boundedEnd);
  if (position >= boundedEnd) {
    return std::nullopt;
  }

  const char first = data_[position];
  if (first == '"') {
    return skipString(position, boundedEnd);
  }
  if (first == '{' || first == '[') {
    const char closing = first == '{' ? '}' : ']';
    size_t cursor = position + 1;
    while (cursor < boundedEnd) {
      cursor = skipWhitespace(cursor, boundedEnd);
      if (cursor >= boundedEnd) {
        return std::nullopt;
      }
      if (data_[cursor] == closing) {
        return cursor + 1;
      }
      if (first == '{') {
        const auto keyEnd = skipString(cursor, boundedEnd);
        if (!keyEnd) {
          return std::nullopt;
        }
        cursor = skipWhitespace(*keyEnd, boundedEnd);
        if (cursor >= boundedEnd || data_[cursor] != ':') {
          return std::nullopt;
        }
        cursor += 1;
      }
      const auto valueEnd = skipValue(cursor, boundedEnd);
      if (!valueEnd) {
        return std::nullopt;
      }
      cursor = skipWhitespace(*valueEnd, boundedEnd);
      if (cursor < boundedEnd && data_[cursor] == ',') {
        cursor += 1;
      } else if (cursor < boundedEnd && data_[cursor] == closing) {
        return cursor + 1;
      } else {
        return std::nullopt;
      }
    }
    return std::nullopt;
  }

  size_t cursor = position;
  while (cursor < boundedEnd) {
    const char value = data_[cursor];
    if (value == ',' || value == '}' || value == ']' || value == ' ' || value == '\t' || value == '\r' || value == '\n') {
      break;
    }
    cursor += 1;
  }
  return cursor > position ? std::optional<size_t>(cursor) : std::nullopt;
}

JsonValueKind ChatJson::kindAt(size_t position) const {
  JsonValueKind kind = JsonValueKind::Primitive;
  if (position >= size_) {
    kind = JsonValueKind::Invalid;
  } else if (data_[position] == '"') {
    kind = JsonValueKind::String;
  } else if (data_[position] == '{') {
    kind = JsonValueKind::Object;
  } else if (data_[position] == '[') {
    kind = JsonValueKind::Array;
  }
  return kind;
}

std::optional<JsonRange> ChatJson::root(size_t start, size_t end) const {
  const size_t position = skipWhitespace(start, end);
  const auto valueEnd = skipValue(position, end);
  std::optional<JsonRange> result;
  if (valueEnd && skipWhitespace(*valueEnd, end) == std::min(end, size_)) {
    result = JsonRange{position, *valueEnd, kindAt(position)};
  }
  return result;
}

std::optional<JsonRange> ChatJson::member(const JsonRange& object, std::string_view key) const {
  std::optional<JsonRange> result;
  if (object.kind == JsonValueKind::Object && object.end <= size_ && object.end > object.start + 1) {
    size_t cursor = object.start + 1;
    while (cursor < object.end - 1 && !result) {
      cursor = skipWhitespace(cursor, object.end);
      if (cursor < object.end && data_[cursor] == '}') {
        break;
      }
      const size_t keyStart = cursor;
      const auto keyEnd = skipString(cursor, object.end);
      if (!keyEnd) {
        break;
      }
      cursor = skipWhitespace(*keyEnd, object.end);
      if (cursor >= object.end || data_[cursor] != ':') {
        break;
      }
      cursor = skipWhitespace(cursor + 1, object.end);
      const auto valueEnd = skipValue(cursor, object.end);
      if (!valueEnd) {
        break;
      }
      const JsonRange keyRange{keyStart, *keyEnd, JsonValueKind::String};
      if (stringEquals(keyRange, key)) {
        result = JsonRange{cursor, *valueEnd, kindAt(cursor)};
        break;
      }
      cursor = skipWhitespace(*valueEnd, object.end);
      if (cursor < object.end && data_[cursor] == ',') {
        cursor += 1;
      } else {
        break;
      }
    }
  }
  return result;
}

bool ChatJson::forEachArrayValue(const JsonRange& array, const std::function<bool(const JsonRange&)>& callback) const {
  bool valid = array.kind == JsonValueKind::Array && array.end <= size_ && array.end > array.start + 1;
  size_t cursor = valid ? array.start + 1 : array.end;
  while (valid && cursor < array.end - 1) {
    cursor = skipWhitespace(cursor, array.end);
    if (cursor < array.end && data_[cursor] == ']') {
      break;
    }
    const auto valueEnd = skipValue(cursor, array.end);
    if (!valueEnd) {
      valid = false;
    } else {
      const JsonRange value{cursor, *valueEnd, kindAt(cursor)};
      if (!callback(value)) {
        break;
      }
      cursor = skipWhitespace(*valueEnd, array.end);
      if (cursor < array.end && data_[cursor] == ',') {
        cursor += 1;
      } else if (cursor >= array.end || data_[cursor] != ']') {
        valid = false;
      }
    }
  }
  return valid;
}

bool ChatJson::boolValue(const JsonRange& value, bool fallback) const {
  bool result = fallback;
  if (value.kind == JsonValueKind::Primitive && value.end <= size_) {
    const std::string_view raw(data_ + value.start, value.end - value.start);
    if (raw == "true") {
      result = true;
    } else if (raw == "false") {
      result = false;
    }
  }
  return result;
}

double ChatJson::numberValue(const JsonRange& value, double fallback) const {
  double result = fallback;
  if (value.kind == JsonValueKind::Primitive && value.end <= size_) {
    const std::string raw(data_ + value.start, value.end - value.start);
    char* parsedEnd = nullptr;
    const double parsed = std::strtod(raw.c_str(), &parsedEnd);
    if (parsedEnd == raw.c_str() + raw.size()) {
      result = parsed;
    }
  }
  return result;
}

std::string ChatJson::stringValue(const JsonRange& value) const {
  std::string output;
  if (value.kind == JsonValueKind::String && value.end <= size_ && value.end >= value.start + 2) {
    output.reserve(value.end - value.start - 2);
    size_t cursor = value.start + 1;
    const size_t end = value.end - 1;
    while (cursor < end) {
      const char current = data_[cursor++];
      if (current != '\\') {
        output.push_back(current);
      } else if (cursor < end) {
        const char escaped = data_[cursor++];
        if (escaped == '"' || escaped == '\\' || escaped == '/') {
          output.push_back(escaped);
        } else if (escaped == 'b') {
          output.push_back('\b');
        } else if (escaped == 'f') {
          output.push_back('\f');
        } else if (escaped == 'n') {
          output.push_back('\n');
        } else if (escaped == 'r') {
          output.push_back('\r');
        } else if (escaped == 't') {
          output.push_back('\t');
        } else if (escaped == 'u' && cursor + 4 <= end) {
          uint32_t codepoint = 0;
          bool validHex = true;
          for (size_t digit = 0; digit < 4; digit += 1) {
            const int nibble = hexValue(data_[cursor + digit]);
            validHex = validHex && nibble >= 0;
            codepoint = (codepoint << 4) | static_cast<uint32_t>(std::max(nibble, 0));
          }
          cursor += 4;
          if (validHex && codepoint >= 0xd800 && codepoint <= 0xdbff && cursor + 6 <= end && data_[cursor] == '\\' && data_[cursor + 1] == 'u') {
            uint32_t low = 0;
            bool validLow = true;
            for (size_t digit = 0; digit < 4; digit += 1) {
              const int nibble = hexValue(data_[cursor + 2 + digit]);
              validLow = validLow && nibble >= 0;
              low = (low << 4) | static_cast<uint32_t>(std::max(nibble, 0));
            }
            if (validLow && low >= 0xdc00 && low <= 0xdfff) {
              codepoint = 0x10000 + ((codepoint - 0xd800) << 10) + (low - 0xdc00);
              cursor += 6;
            }
          }
          appendUtf8(output, validHex ? codepoint : 0xfffd);
        } else {
          output.push_back(escaped);
        }
      }
    }
  }
  return output;
}

bool ChatJson::stringEquals(const JsonRange& value, std::string_view expected) const {
  bool equal = false;
  if (value.kind == JsonValueKind::String && value.end <= size_ && value.end >= value.start + 2) {
    const std::string_view raw(data_ + value.start + 1, value.end - value.start - 2);
    equal = raw.find('\\') == std::string_view::npos ? raw == expected : stringValue(value) == expected;
  }
  return equal;
}

} // namespace margelo::nitro::legendapps::chathistory
