#include "SyntaxHighlighter.hpp"
#import <Foundation/Foundation.h>
#include <algorithm>
#include <sstream>
#include <tuple>
#include <stdexcept>

namespace margelo::nitro::legendapps::syntaxparser {
namespace {
struct Rule {
  std::vector<std::string> path;
  std::string foreground;
  int fontStyle = -1;
  size_t index = 0;
};
struct Theme {
  std::string foreground;
  std::vector<Rule> rules;
};
bool matches(const std::string& scope, const std::string& pattern) {
  return scope == pattern || (scope.size() > pattern.size() &&
    scope.compare(0, pattern.size(), pattern) == 0 && scope[pattern.size()] == '.');
}
Theme parseTheme(NSData *data) {
  id json = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  if (![json isKindOfClass:NSDictionary.class]) throw std::runtime_error("Invalid syntax theme");
  Theme result;
  id colors = json[@"colors"];
  id foreground = [colors isKindOfClass:NSDictionary.class] ? colors[@"editor.foreground"] : nil;
  result.foreground = [foreground isKindOfClass:NSString.class] ? [foreground UTF8String] : "#d4d4d4";
  id entries = json[@"tokenColors"];
  if (![entries isKindOfClass:NSArray.class]) return result;
  for (id entry in entries) {
    if (![entry isKindOfClass:NSDictionary.class]) continue;
    id settings = entry[@"settings"];
    if (![settings isKindOfClass:NSDictionary.class]) continue;
    id scopes = entry[@"scope"];
    if ([scopes isKindOfClass:NSString.class]) scopes = [scopes componentsSeparatedByString:@","];
    if (![scopes isKindOfClass:NSArray.class]) scopes = @[@""];
    for (id scope in scopes) {
      if (![scope isKindOfClass:NSString.class]) continue;
      Rule rule;
      rule.index = result.rules.size();
      std::istringstream parts([scope UTF8String]);
      for (std::string part; parts >> part;) rule.path.push_back(part);
      id color = settings[@"foreground"];
      if ([color isKindOfClass:NSString.class]) rule.foreground = [color UTF8String];
      id fontStyle = settings[@"fontStyle"];
      if ([fontStyle isKindOfClass:NSString.class]) {
        rule.fontStyle = 0;
        std::istringstream styles([fontStyle UTF8String]);
        for (std::string style; styles >> style;) {
          if (style == "italic") rule.fontStyle |= 1;
          if (style == "bold") rule.fontStyle |= 2;
          if (style == "underline") rule.fontStyle |= 4;
          if (style == "strikethrough") rule.fontStyle |= 8;
        }
      }
      if (rule.path.empty() && !rule.foreground.empty()) result.foreground = rule.foreground;
      result.rules.push_back(std::move(rule));
    }
  }
  return result;
}
Theme loadTheme(const std::string& name) {
  if (name.empty() || name.find_first_not_of("abcdefghijklmnopqrstuvwxyz0123456789-") != std::string::npos)
    throw std::runtime_error("Invalid syntax theme name");
  NSString *filename = [NSString stringWithUTF8String:(name + ".json").c_str()];
  NSBundle *main = NSBundle.mainBundle;
  NSString *appName = [main objectForInfoDictionaryKey:@"CFBundleDisplayName"]
    ?: [main objectForInfoDictionaryKey:@"CFBundleName"] ?: main.bundleIdentifier ?: @"Legend Desktop";
  NSURL *support = [NSFileManager.defaultManager URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask].firstObject;
  NSURL *local = [[[[support URLByAppendingPathComponent:appName] URLByAppendingPathComponent:@"syntax-assets"]
    URLByAppendingPathComponent:@"themes"] URLByAppendingPathComponent:filename];
  NSData *data = [NSData dataWithContentsOfURL:local];
  if (!data) {
    NSBundle *bundle = [NSBundle bundleWithPath:[main pathForResource:@"RNSyntaxParserThemes" ofType:@"bundle"]];
    data = [NSData dataWithContentsOfFile:[bundle pathForResource:[filename stringByDeletingPathExtension] ofType:@"json"]];
  }
  if (!data) throw std::runtime_error("Syntax theme not found: " + name);
  return parseTheme(data);
}

bool parentsMatch(const std::vector<std::string>& stack, size_t position, const Rule& rule) {
  for (size_t n = rule.path.size() - 1; n > 0;) {
    auto pattern = rule.path[--n];
    bool immediate = pattern == ">";
    if (immediate) { if (!n) return false; pattern = rule.path[--n]; }
    bool found = false;
    while (position > 0) {
      found = matches(stack[--position], pattern);
      if (found || immediate) break;
    }
    if (!found) return false;
  }
  return true;
}
}
std::vector<SyntaxStyle> resolveTheme(const Theme& theme,
    const std::vector<std::vector<std::string>>& scopes, size_t startIndex) {
  std::vector<SyntaxStyle> result;
  for (size_t id = std::min(startIndex, scopes.size()); id < scopes.size(); ++id) {
    std::string foreground = theme.foreground;
    int fontStyle = 0;
    using Rank = std::tuple<size_t, size_t, size_t, size_t>;
    Rank colorRank{}, fontRank{};
    const auto& stack = scopes[id];
    for (size_t position = 0; position < stack.size(); ++position) {
      for (const auto& rule : theme.rules) {
        if (rule.path.empty() || !matches(stack[position], rule.path.back()) || !parentsMatch(stack, position, rule)) continue;
        const auto& leaf = rule.path.back();
        Rank rank{1 + std::count(leaf.begin(), leaf.end(), '.'), rule.path.size(), position, rule.index};
        if (!rule.foreground.empty() && rank >= colorRank) { foreground = rule.foreground; colorRank = rank; }
        if (rule.fontStyle >= 0 && rank >= fontRank) { fontStyle = rule.fontStyle; fontRank = rank; }
      }
    }
    result.emplace_back(id, foreground, fontStyle);
  }
  return result;
}
std::vector<SyntaxStyle> resolveSyntaxScopeStyles(const std::string& name,
    const std::vector<std::vector<std::string>>& scopes, size_t startIndex) {
  static std::mutex mutex;
  static std::map<std::string, Theme> themes;
  std::lock_guard lock(mutex);
  auto it = themes.find(name);
  if (it == themes.end()) it = themes.emplace(name, loadTheme(name)).first;
  const auto& theme = it->second;
  return resolveTheme(theme, scopes, startIndex);
}
} // namespace margelo::nitro::legendapps::syntaxparser
