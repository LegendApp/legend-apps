package so.legend.apps.storage;

import com.facebook.react.bridge.ReactApplicationContext;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Comparator;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class StorageModule extends NativeStorageSpec {
  public static final String NAME = "NativeStorage";

  public StorageModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  private File storageRoot(String rootName) throws IOException {
    File root;
    if ("applicationSupport".equals(rootName) || "document".equals(rootName)) {
      root = getReactApplicationContext().getFilesDir();
    } else if ("cache".equals(rootName)) {
      root = getReactApplicationContext().getCacheDir();
    } else {
      return null;
    }
    return root.getCanonicalFile();
  }

  private File storageFile(String rootName, String relativePath) throws IOException {
    if (relativePath == null || new File(relativePath).isAbsolute()) {
      return null;
    }

    File root = storageRoot(rootName);
    if (root == null) {
      return null;
    }
    File file = new File(root, relativePath).getCanonicalFile();
    String rootPrefix = root.getPath() + File.separator;
    return file.equals(root) || file.getPath().startsWith(rootPrefix) ? file : null;
  }

  @Override
  public String getStoragePathUri(String rootName, String relativePath) {
    try {
      File file = storageFile(rootName, relativePath);
      return file == null ? "" : file.toURI().toString();
    } catch (IOException ignored) {
      return "";
    }
  }

  @Override
  public String readStorageText(String rootName, String relativePath) {
    try {
      File file = relativePath.isEmpty() ? null : storageFile(rootName, relativePath);
      if (file == null || !file.isFile()) {
        return null;
      }
      StringBuilder value = new StringBuilder((int) Math.min(file.length(), 8192));
      try (BufferedReader reader = new BufferedReader(new InputStreamReader(
          new FileInputStream(file), StandardCharsets.UTF_8))) {
        char[] buffer = new char[4096];
        int count;
        while ((count = reader.read(buffer)) >= 0) {
          value.append(buffer, 0, count);
        }
      }
      return value.toString();
    } catch (IOException ignored) {
      return null;
    }
  }

  @Override
  public boolean writeStorageText(String rootName, String relativePath, String value) {
    try {
      File file = relativePath.isEmpty() ? null : storageFile(rootName, relativePath);
      if (file == null) {
        return false;
      }
      File parent = file.getParentFile();
      if (parent == null || (!parent.isDirectory() && !parent.mkdirs())) {
        return false;
      }
      try (BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(
          new FileOutputStream(file), StandardCharsets.UTF_8))) {
        writer.write(value);
      }
      return true;
    } catch (IOException ignored) {
      return false;
    }
  }

  @Override
  public boolean deleteStoragePath(String rootName, String relativePath) {
    try {
      File file = relativePath.isEmpty() ? null : storageFile(rootName, relativePath);
      return file != null && (!file.exists() || deleteRecursively(file));
    } catch (IOException ignored) {
      return false;
    }
  }

  private boolean deleteRecursively(File file) {
    File[] children = file.isDirectory() ? file.listFiles() : null;
    if (children != null) {
      for (File child : children) {
        if (!deleteRecursively(child)) {
          return false;
        }
      }
    }
    return file.delete();
  }

  @Override
  public boolean ensureStorageDirectory(String rootName, String relativePath) {
    try {
      File directory = storageFile(rootName, relativePath);
      return directory != null && (directory.isDirectory() || directory.mkdirs());
    } catch (IOException ignored) {
      return false;
    }
  }

  @Override
  public String listStorageDirectoryJson(String rootName, String relativePath) {
    try {
      File directory = storageFile(rootName, relativePath);
      File[] files = directory == null ? null : directory.listFiles();
      if (files == null) {
        return "[]";
      }
      Arrays.sort(files, Comparator.comparing(File::getName, String.CASE_INSENSITIVE_ORDER));
      JSONArray entries = new JSONArray();
      for (File file : files) {
        entries.put(new JSONObject()
            .put("isDirectory", file.isDirectory())
            .put("name", file.getName()));
      }
      return entries.toString();
    } catch (IOException | JSONException ignored) {
      return "[]";
    }
  }

  @Override
  public String readTextFile(String pathOrUri) {
    try {
      File file = pathOrUri.startsWith("file://") ? new File(URI.create(pathOrUri)) : new File(pathOrUri);
      if (!file.isFile()) {
        return null;
      }
      StringBuilder value = new StringBuilder((int) Math.min(file.length(), 8192));
      try (BufferedReader reader = new BufferedReader(new InputStreamReader(
          new FileInputStream(file), StandardCharsets.UTF_8))) {
        char[] buffer = new char[4096];
        int count;
        while ((count = reader.read(buffer)) >= 0) {
          value.append(buffer, 0, count);
        }
      }
      return value.toString();
    } catch (IllegalArgumentException | IOException ignored) {
      return null;
    }
  }
}
