require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name = "RNChatHistory"
  s.version = package["version"]
  s.summary = "Fast local Codex and Claude transcript reader"
  s.license = { :type => "MIT" }
  s.author = "Legend"
  s.homepage = "https://legendapp.com"
  s.source = { :path => "." }
  s.platforms = { :osx => "14.0" }
  s.source_files = "cpp/**/*.{h,hpp,cpp,mm}", "ios/**/*.{h,m,mm}"
  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++20",
    "HEADER_SEARCH_PATHS" => "$(PODS_TARGET_SRCROOT)/../native-text-source/cpp",
  }
  s.dependency "React-Core"
  load "nitrogen/generated/ios/RNChatHistory+autolinking.rb"
  add_nitrogen_files(s)
end
