package com.legenddesktop.medialibraryscanner;

import com.facebook.react.BaseReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import java.util.HashMap;
import java.util.Map;

public class MediaLibraryScannerPackage extends BaseReactPackage {
  @Override
  public NativeModule getModule(String name, ReactApplicationContext reactContext) {
    if (MediaLibraryScannerModule.NAME.equals(name)) {
      return new MediaLibraryScannerModule(reactContext);
    }
    return null;
  }

  @Override
  public ReactModuleInfoProvider getReactModuleInfoProvider() {
    return new ReactModuleInfoProvider() {
      @Override
      public Map<String, ReactModuleInfo> getReactModuleInfos() {
        Map<String, ReactModuleInfo> map = new HashMap<>();
        map.put(
            MediaLibraryScannerModule.NAME,
            new ReactModuleInfo(
                MediaLibraryScannerModule.NAME, MediaLibraryScannerModule.NAME, false, false, false, true));
        return map;
      }
    };
  }
}
