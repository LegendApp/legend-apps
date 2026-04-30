package com.legenddesktop.audioplayer;

import com.facebook.react.BaseReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import java.util.HashMap;
import java.util.Map;

public class AudioPlayerPackage extends BaseReactPackage {
  @Override
  public NativeModule getModule(String name, ReactApplicationContext reactContext) {
    if (AudioPlayerModule.NAME.equals(name)) {
      return new AudioPlayerModule(reactContext);
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
            AudioPlayerModule.NAME,
            new ReactModuleInfo(
                AudioPlayerModule.NAME,
                AudioPlayerModule.NAME,
                false,
                false,
                false,
                true));
        return map;
      }
    };
  }
}
