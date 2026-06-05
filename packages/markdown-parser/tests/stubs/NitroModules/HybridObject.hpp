#pragma once

#include <cstddef>

namespace margelo::nitro {
class Prototype {
public:
  template <typename... Args>
  void registerHybridGetter(Args...) {}

  template <typename... Args>
  void registerHybridMethod(Args...) {}
};

class HybridObject {
public:
  explicit HybridObject(const char*) {}
  virtual ~HybridObject() = default;

protected:
  virtual void loadHybridMethods() {}
  virtual size_t getExternalMemorySize() noexcept {
    return 0;
  }
};

template <typename Callback>
void registerHybrids(HybridObject*, Callback callback) {
  Prototype prototype;
  callback(prototype);
}
} // namespace margelo::nitro
