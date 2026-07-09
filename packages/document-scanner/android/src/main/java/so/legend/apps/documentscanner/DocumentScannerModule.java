package so.legend.apps.documentscanner;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;

public class DocumentScannerModule extends NativeDocumentScannerSpec {
  public static final String NAME = "NativeDocumentScanner";

  public DocumentScannerModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @Override
  public void scanDocuments(String pathsJson, String optionsJson, Promise promise) {
    promise.resolve("{\"totalDocuments\":0,\"totalRoots\":0,\"errors\":[]}");
  }

  @Override
  public void addListener(String eventName) {}

  @Override
  public void removeListeners(double count) {}
}
