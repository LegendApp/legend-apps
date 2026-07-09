package so.legend.apps.recentdocuments;

import com.facebook.react.bridge.ReactApplicationContext;

public class RecentDocumentsModule extends NativeRecentDocumentsSpec {
  public static final String NAME = "NativeRecentDocuments";

  public RecentDocumentsModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @Override
  public void noteRecentDocument(String path) {}

  @Override
  public void addListener(String eventName) {}

  @Override
  public void removeListeners(double count) {}
}
