package so.legend.apps.mediatags;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;

public class MediaTagsModule extends NativeMediaTagsSpec {
  public static final String NAME = "NativeMediaTags";

  public MediaTagsModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @Override
  public void readMediaTags(String filePath, String optionsJson, Promise promise) {
    promise.resolve("{}");
  }

  @Override
  public void writeMediaTags(String filePath, String updatesJson, Promise promise) {
    promise.reject("UNSUPPORTED", "Media tag writing has not been ported yet");
  }
}
