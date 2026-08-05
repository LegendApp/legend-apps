#pragma once

#include <cstddef>
#include <fstream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>

#if defined(__unix__) || defined(__APPLE__)
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#endif

namespace legendapps::nativetextsource {

class NativeTextSource {
public:
  virtual ~NativeTextSource() = default;
  virtual const char* data() const noexcept = 0;
  virtual size_t size() const noexcept = 0;
  virtual size_t externalMemorySize() const noexcept = 0;
};

class StringTextSource final : public NativeTextSource {
public:
  explicit StringTextSource(std::string source) : source_(std::move(source)) {}

  const char* data() const noexcept override {
    return source_.data();
  }

  size_t size() const noexcept override {
    return source_.size();
  }

  size_t externalMemorySize() const noexcept override {
    return source_.capacity();
  }

private:
  std::string source_;
};

struct NativeTextFileErrors {
  std::string open;
  std::string stat;
  std::string map;
};

inline std::shared_ptr<const NativeTextSource> makeStringTextSource(std::string source) {
  return std::make_shared<StringTextSource>(std::move(source));
}

inline std::string normalizeTextFilePath(const std::string& filePath) {
  constexpr const char* prefix = "file://";
  constexpr size_t prefixLength = 7;
  if (filePath.compare(0, prefixLength, prefix) == 0) {
    return filePath.substr(prefixLength);
  }
  return filePath;
}

#if defined(__unix__) || defined(__APPLE__)

class MappedTextSource final : public NativeTextSource {
public:
  MappedTextSource(int descriptor, const char* data, size_t size)
      : descriptor_(descriptor), data_(data), size_(size) {}

  ~MappedTextSource() override {
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

#endif

inline std::shared_ptr<const NativeTextSource> readTextFileSource(
    const std::string& filePath,
    const NativeTextFileErrors& errors) {
  const std::string normalizedPath = normalizeTextFilePath(filePath);

#if defined(__unix__) || defined(__APPLE__)
  const int descriptor = open(normalizedPath.c_str(), O_RDONLY);
  if (descriptor < 0) {
    throw std::runtime_error(errors.open);
  }

  struct stat fileStat {};
  if (fstat(descriptor, &fileStat) != 0) {
    close(descriptor);
    throw std::runtime_error(errors.stat);
  }

  if (fileStat.st_size <= 0) {
    close(descriptor);
    return makeStringTextSource("");
  }

  void* data = mmap(
      nullptr,
      static_cast<size_t>(fileStat.st_size),
      PROT_READ,
      MAP_PRIVATE,
      descriptor,
      0);
  if (data == MAP_FAILED) {
    close(descriptor);
    throw std::runtime_error(errors.map);
  }

  return std::make_shared<MappedTextSource>(
      descriptor,
      static_cast<const char*>(data),
      static_cast<size_t>(fileStat.st_size));
#else
  std::ifstream input(normalizedPath, std::ios::binary);
  if (!input) {
    throw std::runtime_error(errors.open);
  }
  std::ostringstream buffer;
  buffer << input.rdbuf();
  return makeStringTextSource(buffer.str());
#endif
}

} // namespace legendapps::nativetextsource
