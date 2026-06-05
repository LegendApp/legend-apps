#pragma once

#include <functional>
#include <memory>

namespace margelo::nitro {
template <typename T>
class Promise {
public:
  explicit Promise(T value) : value_(std::move(value)) {}

  template <typename Callback>
  static std::shared_ptr<Promise<T>> async(Callback callback) {
    return std::make_shared<Promise<T>>(callback());
  }

  const T& get() const {
    return value_;
  }

private:
  T value_;
};
} // namespace margelo::nitro
