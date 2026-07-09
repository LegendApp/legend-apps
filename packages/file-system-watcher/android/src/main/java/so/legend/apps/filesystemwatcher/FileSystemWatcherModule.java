package so.legend.apps.filesystemwatcher;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;

public class FileSystemWatcherModule extends NativeFileSystemWatcherSpec {
  public static final String NAME = "NativeFileSystemWatcher";

  public FileSystemWatcherModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @Override
  public void setWatchedDirectories(String directoriesJson) {}

  @Override
  public void isWatchingDirectory(String directory, Promise promise) {
    promise.resolve(false);
  }

  @Override
  public void addListener(String eventName) {}

  @Override
  public void removeListeners(double count) {}
}
