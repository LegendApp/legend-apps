require "json"
package = JSON.parse(File.read(File.join(__dir__, "package.json")))
Pod::Spec.new do |s|
  s.name = "RNSourceEditor"
  s.version = package["version"]
  s.summary = "Legend List source editor input and text layout"
  s.license = { :type => "MIT" }
  s.author = "Legend"
  s.homepage = "https://legendapp.com"
  s.source = { :path => "." }
  s.platforms = { :osx => "14.0" }
  s.source_files = "macos/**/*.{h,mm}", "cpp/**/*.hpp"
  s.frameworks = "AppKit", "CoreText"
  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++20",
    "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/Headers/Private/Yoga\""
  }
  s.dependency "React-Core"
  s.dependency "React-RCTFabric"
  s.dependency "ReactCodegen"
end
