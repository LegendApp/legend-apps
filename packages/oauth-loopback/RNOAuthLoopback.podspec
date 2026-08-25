require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name = "RNOAuthLoopback"
  s.version = package["version"]
  s.summary = "Local OAuth callback listener for Legend apps"
  s.license = { :type => "MIT" }
  s.author = "Legend"
  s.homepage = "https://legendapp.com"
  s.source = { :path => "." }
  s.platforms = { :osx => "14.0" }
  s.source_files = "ios/**/*.swift"
  s.frameworks = "Foundation", "Network"
  s.dependency "React-Core"
  load "nitrogen/generated/ios/RNOAuthLoopback+autolinking.rb"
  add_nitrogen_files(s)
end
