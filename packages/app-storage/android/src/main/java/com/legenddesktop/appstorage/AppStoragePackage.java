package com.legenddesktop.appstorage;

import com.facebook.react.TurboReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import java.util.HashMap;
import java.util.Map;

public class AppStoragePackage extends TurboReactPackage {
  @Override
  public NativeModule getModule(String name, ReactApplicationContext reactContext) {
    if (name.equals(AppStorageModule.NAME)) {
      return new AppStorageModule(reactContext);
    }
    return null;
  }

  @Override
  public ReactModuleInfoProvider getReactModuleInfoProvider() {
    return () -> {
      Map<String, ReactModuleInfo> moduleInfos = new HashMap<>();
      moduleInfos.put(
        AppStorageModule.NAME,
        new ReactModuleInfo(
          AppStorageModule.NAME,
          AppStorageModule.NAME,
          false,
          false,
          false,
          false,
          true
        )
      );
      return moduleInfos;
    };
  }
}
