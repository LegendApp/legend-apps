package com.legenddesktop.appstorage;

import android.content.SharedPreferences;
import android.content.Context;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;

public class AppStorageModule extends NativeAppStorageSpec {
  public static final String NAME = "NativeAppStorage";
  private static final String STORAGE_NAME = "legend_desktop_app_storage";

  public AppStorageModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @Override
  public void getString(String key, Promise promise) {
    promise.resolve(getPreferences().getString(key, ""));
  }

  @Override
  public void setString(String key, String value, Promise promise) {
    promise.resolve(getPreferences().edit().putString(key, value).commit());
  }

  @Override
  public void removeItem(String key, Promise promise) {
    promise.resolve(getPreferences().edit().remove(key).commit());
  }

  private SharedPreferences getPreferences() {
    return getReactApplicationContext().getSharedPreferences(STORAGE_NAME, Context.MODE_PRIVATE);
  }
}
