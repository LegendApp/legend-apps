package com.legenddesktop.storage;

import com.facebook.react.TurboReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import java.util.HashMap;
import java.util.Map;

public class StoragePackage extends TurboReactPackage {
  @Override
  public NativeModule getModule(String name, ReactApplicationContext reactContext) {
    if (StorageModule.NAME.equals(name)) {
      return new StorageModule(reactContext);
    }
    return null;
  }

  @Override
  public ReactModuleInfoProvider getReactModuleInfoProvider() {
    return () -> {
      Map<String, ReactModuleInfo> modules = new HashMap<>();
      modules.put(
          StorageModule.NAME,
          new ReactModuleInfo(
              StorageModule.NAME,
              StorageModule.NAME,
              false,
              false,
              false,
              true));
      return modules;
    };
  }
}
