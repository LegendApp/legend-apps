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
    "RNSyntaxParserGrammars" => [
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/javascript.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/typescript.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/jsx.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/tsx.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/json.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/markdown.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/yaml.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/css.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/scss.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/html.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/xml.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/shellscript.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/python.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/ruby.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/go.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/rust.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/swift.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/kotlin.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/java.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/cpp.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/c.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/objective-c.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/objective-cpp.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/toml.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/grammars/docker.json",
    ],
    "RNSyntaxParserThemes" => [
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-themes/themes/dark-plus.json",
      "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-themes/themes/github-light.json",
    ],
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
      "$(PODS_TARGET_SRCROOT)/../native-text-source/cpp",
    ].join(" "),
  }
  s.dependency "React-Core"
  load "nitrogen/generated/ios/RNSyntaxParser+autolinking.rb"
  add_nitrogen_files(s)
end
