#pragma once

#include "JSIConverter.hpp"

namespace margelo::nitro {
class PropNameIDCache {
public:
  static jsi::PropNameID get(jsi::Runtime&, const char*) {
    return {};
  }
};
} // namespace margelo::nitro
