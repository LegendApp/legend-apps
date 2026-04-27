package com.legenddesktop.windowcontrols;

import com.facebook.react.BaseReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import java.util.HashMap;
import java.util.Map;

public class WindowControlsPackage extends BaseReactPackage {
  @Override
  public NativeModule getModule(String name, ReactApplicationContext reactContext) {
    if (WindowControlsModule.NAME.equals(name)) {
      return new WindowControlsModule(reactContext);
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
            WindowControlsModule.NAME,
            new ReactModuleInfo(
                WindowControlsModule.NAME,
                WindowControlsModule.NAME,
                false,
                false,
                false,
                true));
        return map;
      }
    };
  }
}
