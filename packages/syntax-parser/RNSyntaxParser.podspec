require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name = "RNSyntaxParser"
  s.version = package["version"]
  s.summary = "Legend Desktop syntax parser"
  s.license = { :type => "MIT" }
  s.author = "Legend"
  s.homepage = "https://legendapp.com"
  s.source = { :path => "." }
  s.platforms = { :ios => "15.0", :osx => "14.0" }
  s.source_files = ["cpp/**/*.{h,hpp,cpp,mm}", "vendor/tree-sitter/runtime/src/lib.c"]
  s.preserve_paths = ["vendor/tree-sitter/runtime/**/*"]
  s.resource_bundles = {
    "RNSyntaxParserThemes" => [
      "themes/dark-plus.json",
      "themes/github-light.json",
      "themes/LICENSE",
      "themes/NOTICE",
    ],
  }
  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
    "OTHER_CFLAGS" => '$(inherited) -include "$(PODS_TARGET_SRCROOT)/vendor/tree-sitter/Symbols.h"',
    "OTHER_CPLUSPLUSFLAGS" => '$(inherited) -include "$(PODS_TARGET_SRCROOT)/vendor/tree-sitter/Symbols.h"',
    "HEADER_SEARCH_PATHS" => [
      "$(PODS_TARGET_SRCROOT)/../native-text-source/cpp",
      "$(PODS_TARGET_SRCROOT)/vendor/tree-sitter/runtime/include",
    ].join(" "),
  }
  s.dependency "React-Core"
  s.frameworks = "Security"
  load "nitrogen/generated/ios/RNSyntaxParser+autolinking.rb"
  add_nitrogen_files(s)
end
