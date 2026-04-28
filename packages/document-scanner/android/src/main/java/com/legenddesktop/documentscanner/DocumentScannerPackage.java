package com.legenddesktop.documentscanner;

import com.facebook.react.BaseReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import java.util.HashMap;
import java.util.Map;

public class DocumentScannerPackage extends BaseReactPackage {
  @Override
  public NativeModule getModule(String name, ReactApplicationContext reactContext) {
    if (DocumentScannerModule.NAME.equals(name)) {
      return new DocumentScannerModule(reactContext);
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
            DocumentScannerModule.NAME,
            new ReactModuleInfo(DocumentScannerModule.NAME, DocumentScannerModule.NAME, false, false, false, true));
        return map;
      }
    };
  }
}
