#pragma once

namespace jsi {
class Runtime {};
class PropNameID {};

class Object;

class Value {
public:
  Value() = default;
  Value(const Object&) {}

  bool isObject() const {
    return false;
  }

  Object asObject(Runtime&) const;
  Object getObject(Runtime&) const;
};

class Object {
public:
  explicit Object(Runtime&) {}

  Value getProperty(Runtime&, const PropNameID&) const {
    return {};
  }

  template <typename T>
  void setProperty(Runtime&, const PropNameID&, const T&) {}
};

inline Object Value::asObject(Runtime& runtime) const {
  return Object(runtime);
}

inline Object Value::getObject(Runtime& runtime) const {
  return Object(runtime);
}
} // namespace jsi

namespace margelo::nitro {
template <typename T>
struct JSIConverter {
  static T fromJSI(jsi::Runtime&, const jsi::Value&) {
    return {};
  }

  static jsi::Value toJSI(jsi::Runtime&, const T&) {
    return {};
  }

  static bool canConvert(jsi::Runtime&, const jsi::Value&) {
    return true;
  }
};
} // namespace margelo::nitro
