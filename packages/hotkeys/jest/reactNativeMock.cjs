const nativeModule = {
  addListener() {},
  removeListeners() {},
  respondToKeyEvent() {},
  startMonitoringKeyboard: async () => true,
  stopMonitoringKeyboard: async () => true,
};

module.exports = {
  NativeEventEmitter: class NativeEventEmitter {
    addListener() {
      return { remove() {} };
    }
  },
  Platform: {
    OS: "macos",
  },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: {
    create: (styles) => styles,
  },
  Text: "Text",
  TurboModuleRegistry: {
    getEnforcing: () => nativeModule,
  },
  View: "View",
};
