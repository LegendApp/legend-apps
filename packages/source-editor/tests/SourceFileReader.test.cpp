#include "../cpp/SourceFileReader.hpp"
#include <cassert>
#include <filesystem>
#include <iostream>
#include <random>
#include <unistd.h>

int main() {
  char path[] = "/tmp/legend-source-reader.XXXXXX";
  int fd = mkstemp(path); assert(fd >= 0); close(fd);
  const auto write = [&](const std::string &source) {
    std::ofstream output(path, std::ios::binary); output << source;
  };
  const std::string utf8 = "a\r\nb\rc\n\xf0\x9f\x98\x80\xe4\xb8\xad\xe6\x96\x87\ne\xcc\x81";
  const std::u16string expected = u"a\r\nb\rc\n\U0001f600中文\ne\u0301";
  for (size_t bytes = 4; bytes < 25; ++bytes) {
    write(utf8);
    legend::source::SourceFileReader reader(path);
    std::u16string result;
    while (!reader.done()) result += reader.next(bytes, 2);
    assert(result == expected);
  }
  write("\xef\xbb\xbf" + utf8);
  {
    legend::source::SourceFileReader reader(path);
    std::u16string result = reader.next(1024, 1);
    while (!reader.done()) result += reader.next(4, 1);
    assert(result == expected);
  }
  { legend::source::SourceFileReader reader(path); assert(reader.next() == expected); }
  // Vary read and line budgets on every call, not just between files. This
  // catches buffered UTF-8/CRLF state leaking across changing batch sizes.
  for (unsigned seed = 1; seed <= 40; ++seed) {
    std::mt19937 random(seed);
    std::string source;
    std::u16string reference;
    for (size_t i = 0; i < 100; ++i) { source += utf8; reference += expected; }
    write(source);
    legend::source::SourceFileReader reader(path);
    std::u16string result;
    size_t calls = 0;
    while (!reader.done()) {
      result += reader.next(4 + random() % 100, 1 + random() % 20);
      assert(++calls < source.size());
    }
    assert(result == reference);
    assert(reader.next().empty());
  }
  write("valid\n\xf0\x9f");
  {
    legend::source::SourceFileReader reader(path);
    assert(reader.next(6, 1) == u"valid\n");
    bool threw = false;
    try { reader.next(); } catch (const std::runtime_error &) { threw = true; }
    assert(threw); // Errors after a successfully displayed prefix still surface.
  }
  write("");
  { legend::source::SourceFileReader reader(path); assert(reader.next().empty() && reader.done()); }
  write("a\r\nb");
  { legend::source::SourceFileReader reader(path); assert(reader.next(4, 1) == u"a\r\n"); assert(reader.next() == u"b"); }
  for (const auto &invalid : {"\xc0\xaf", "\xed\xa0\x80", "\xf4\x90\x80\x80", "\xf0\x9f", "\x80"}) {
    write(invalid); bool threw = false;
    try { legend::source::SourceFileReader reader(path); reader.next(); } catch (const std::runtime_error &) { threw = true; }
    assert(threw);
  }
  // Prefix work is bounded for both millions of lines and a single long line.
  for (const auto newline : {true, false}) {
    std::string source(4 * 1024 * 1024, 'x');
    if (newline) for (size_t i = 64; i < source.size(); i += 65) source[i] = '\n';
    write(source);
    legend::source::SourceFileReader reader(path);
    const auto prefix = reader.next(16384, 128);
    assert(prefix.size() <= 16384 && !prefix.empty() && !reader.done());
    assert(reader.bytesRead() == 16384);
  }
  std::filesystem::remove(path);
  std::cout << "SourceFileReader: bounded prefixes, long lines, UTF-8/BOM, CRLF boundaries and malformed input passed\n";
}
