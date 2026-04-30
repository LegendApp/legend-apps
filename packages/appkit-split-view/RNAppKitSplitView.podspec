require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name = "RNAppKitSplitView"
  s.version = package["version"]
  s.summary = "Legend Desktop AppKit split view bindings"
  s.license = { :type => "MIT" }
  s.author = "Legend"
  s.homepage = "https://legendapp.com"
  s.source = { :path => "." }
  s.platforms = { :ios => "15.0", :osx => "14.0" }
  s.source_files = "ios/**/*.{h,m,mm}"
  s.pod_target_xcconfig = {
    "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/Headers/Private/Yoga\" \"$(PODS_ROOT)/../build/generated/ios\""
  }
  s.dependency "React-Core"
  s.dependency "React-RCTFabric"
  s.dependency "ReactCodegen"
end
