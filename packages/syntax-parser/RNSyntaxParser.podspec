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
  s.source_files = "cpp/**/*.{h,hpp,cpp}"
  s.preserve_paths = "vendor/TextMateLib/**/*"
  s.resource_bundles = {
    "RNSyntaxParserGrammars" => "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/raw/*.json",
    "RNSyntaxParserThemes" => "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-themes/themes/*.json",
  }
  s.vendored_libraries = [
    "vendor/TextMateLib/packages/tml-cpp/build/libtml.a",
    "vendor/TextMateLib/packages/tml-cpp/build/oniguruma/lib/libonig.a",
  ]
  s.prepare_command = "bash scripts/build-textmatelib.sh"
  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
    "GCC_PREPROCESSOR_DEFINITIONS" => "$(inherited) TEXTMATE_STATIC=1",
    "HEADER_SEARCH_PATHS" => [
      "$(PODS_TARGET_SRCROOT)/vendor/TextMateLib/packages/tml-cpp/src",
      "$(PODS_TARGET_SRCROOT)/vendor/TextMateLib/packages/tml-cpp/build",
      "$(PODS_TARGET_SRCROOT)/vendor/TextMateLib/packages/tml-cpp/build/oniguruma/include",
      "$(PODS_TARGET_SRCROOT)/vendor/TextMateLib/thirdparty/rapidjson/include",
    ].join(" "),
  }
  s.dependency "React-Core"
  load "nitrogen/generated/ios/RNSyntaxParser+autolinking.rb"
  add_nitrogen_files(s)
end
