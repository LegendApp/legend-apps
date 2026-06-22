require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name = "RNDiffParser"
  s.version = package["version"]
  s.summary = "Legend Desktop diff parser"
  s.license = { :type => "MIT" }
  s.author = "Legend"
  s.homepage = "https://legendapp.com"
  s.source = { :path => "." }
  s.platforms = { :ios => "15.0", :osx => "14.0" }
  s.source_files = "cpp/**/*.{h,hpp,cpp}"
  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
    "HEADER_SEARCH_PATHS" => [
      "$(PODS_ROOT)/LegendLibGit2/build/include",
      "$(PODS_ROOT)/LegendLibGit2/build/gen_headers",
    ].join(" "),
  }
  s.dependency "React-Core"
  s.dependency "LegendLibGit2"
  load "nitrogen/generated/ios/RNDiffParser+autolinking.rb"
  add_nitrogen_files(s)
end
