#pragma once

#include "JSIConverter.hpp"

namespace margelo::nitro {
inline bool isPlainObject(jsi::Runtime&, const jsi::Object&) {
  return true;
}
} // namespace margelo::nitro
