package com.legenddesktop.markdownparser;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;

public class MarkdownParserModule extends NativeMarkdownParserSpec {
  public static final String NAME = "NativeMarkdownParser";

  public MarkdownParserModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @Override
  public void parseMarkdown(String markdown, String optionsJson, Promise promise) {
    String text = markdown == null ? "" : markdown;
    String escaped = escapeJson(text);
    promise.resolve(
        "{\"blocks\":[{\"id\":\"0\",\"type\":\"paragraph\",\"index\":0,\"depth\":0,\"text\":\""
            + escaped
            + "\",\"markdown\":\""
            + escaped
            + "\",\"runs\":[{\"type\":\"text\",\"text\":\""
            + escaped
            + "\",\"offset\":0,\"length\":"
            + text.length()
            + "}]}]}");
  }

  @Override
  public void parseMarkdownFile(String filePath, String optionsJson, Promise promise) {
    promise.resolve("{\"blocks\":[]}");
  }

  @Override
  public void scanMarkdown(String markdown, String optionsJson, Promise promise) {
    parseMarkdown(markdown, optionsJson, promise);
  }

  @Override
  public void scanMarkdownFile(String filePath, String optionsJson, Promise promise) {
    parseMarkdownFile(filePath, optionsJson, promise);
  }

  private static String escapeJson(String value) {
    StringBuilder builder = new StringBuilder(value.length() + 16);
    for (int i = 0; i < value.length(); i++) {
      char c = value.charAt(i);
      switch (c) {
        case '"':
          builder.append("\\\"");
          break;
        case '\\':
          builder.append("\\\\");
          break;
        case '\b':
          builder.append("\\b");
          break;
        case '\f':
          builder.append("\\f");
          break;
        case '\n':
          builder.append("\\n");
          break;
        case '\r':
          builder.append("\\r");
          break;
        case '\t':
          builder.append("\\t");
          break;
        default:
          if (c < 0x20) {
            builder.append(String.format("\\u%04x", (int) c));
          } else {
            builder.append(c);
          }
      }
    }
    return builder.toString();
  }
}
