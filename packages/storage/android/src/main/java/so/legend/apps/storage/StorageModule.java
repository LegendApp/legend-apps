package so.legend.apps.storage;

import com.facebook.react.bridge.ReactApplicationContext;

public class StorageModule extends NativeStorageSpec {
  public static final String NAME = "NativeStorage";

  public StorageModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @Override
  public String getApplicationSupportDirectory() {
    return getReactApplicationContext().getFilesDir().toURI().toString();
  }
}
