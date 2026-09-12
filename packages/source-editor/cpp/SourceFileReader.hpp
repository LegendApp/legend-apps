#pragma once
#include <algorithm>
#include <cstdint>
#include <fstream>
#include <stdexcept>
#include <string>

namespace legend::source {

// Bounded UTF-8 decoding for progressive loading. A long logical line is not a
// reason to read the rest of the file before displaying the first prefix.
class SourceFileReader {
  std::ifstream file_;
  std::string pending_;
  bool eof_ = false, first_ = true;
  bool hasBOM_ = false;
  size_t bytesRead_ = 0;

public:
  explicit SourceFileReader(const std::string &path) : file_(path, std::ios::binary) {
    if (!file_) throw std::runtime_error("Unable to open source file: " + path);
  }
  bool done() const { return eof_ && pending_.empty(); }
  bool hasBOM() const { return hasBOM_; }
  size_t bytesRead() const { return bytesRead_; }

  std::u16string next(size_t byteLimit = 262144, size_t lineLimit = 4096) {
    if (byteLimit < 4 || !lineLimit) throw std::invalid_argument("Invalid source read limits");
    if (!eof_ && pending_.size() < byteLimit) {
      const auto oldSize = pending_.size();
      pending_.resize(byteLimit);
      file_.read(pending_.data() + oldSize, byteLimit - oldSize);
      const auto read = static_cast<size_t>(file_.gcount());
      bytesRead_ += read;
      pending_.resize(oldSize + read);
      if (file_.bad()) throw std::runtime_error("Failed while reading source file");
      eof_ = file_.eof();
    }
    if (first_) {
      first_ = false;
      if (pending_.starts_with("\xef\xbb\xbf")) { hasBOM_ = true; pending_.erase(0, 3); }
    }
    const auto limit = std::min(byteLimit, pending_.size());
    std::u16string output;
    output.reserve(limit);
    size_t cursor = 0, lines = 0;
    while (cursor < limit) {
      const auto start = cursor;
      const auto lead = static_cast<unsigned char>(pending_[cursor]);
      size_t width = lead < 0x80 ? 1 : lead >= 0xc2 && lead <= 0xdf ? 2
        : lead >= 0xe0 && lead <= 0xef ? 3 : lead >= 0xf0 && lead <= 0xf4 ? 4 : 0;
      if (!width) throw std::runtime_error("Source file is not valid UTF-8");
      if (cursor + width > limit) {
        if (eof_ && cursor + width > pending_.size()) throw std::runtime_error("Incomplete UTF-8 sequence at end of source file");
        break;
      }
      // Keep CRLF indivisible across batches, even at the read-buffer boundary.
      if (lead == '\r' && cursor + 1 == limit && (!eof_ || limit < pending_.size())) break;
      uint32_t scalar = lead & (width == 1 ? 0x7f : (1 << (7 - width)) - 1);
      for (size_t i = 1; i < width; ++i) {
        const auto byte = static_cast<unsigned char>(pending_[cursor + i]);
        if ((byte & 0xc0) != 0x80) throw std::runtime_error("Source file is not valid UTF-8");
        scalar = (scalar << 6) | (byte & 0x3f);
      }
      if ((width == 2 && scalar < 0x80) || (width == 3 && scalar < 0x800)
        || (width == 4 && scalar < 0x10000) || scalar > 0x10ffff
        || (scalar >= 0xd800 && scalar <= 0xdfff)) throw std::runtime_error("Source file is not valid UTF-8");
      cursor += width;
      if (scalar < 0x10000) output.push_back(static_cast<char16_t>(scalar));
      else {
        scalar -= 0x10000;
        output.push_back(static_cast<char16_t>(0xd800 + (scalar >> 10)));
        output.push_back(static_cast<char16_t>(0xdc00 + (scalar & 0x3ff)));
      }
      if (lead == '\r' || lead == '\n') {
        if (lead == '\r' && cursor < limit && pending_[cursor] == '\n') { output.push_back(u'\n'); ++cursor; }
        if (++lines >= lineLimit) break;
      }
      if (cursor == start) throw std::logic_error("Source reader made no progress");
    }
    pending_.erase(0, cursor);
    return output;
  }
};
} // namespace legend::source
