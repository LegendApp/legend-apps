#pragma once
#include <functional>
#include <string>
namespace margelo::nitro::legendapps::syntaxparser {
// Blocking worker API; download progress is throttled in the transport delegate.
std::string installGrammarPack(const std::string& name, const std::string& url,
  const std::string& sha256, double size, const std::function<void(double, double)>& progress);
}
