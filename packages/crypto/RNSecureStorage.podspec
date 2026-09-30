require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name = "RNSecureStorage"
  s.version = package["version"]
  s.summary = "Keychain-backed credential storage for Legend apps"
  s.license = { :type => "MIT" }
  s.author = "Legend"
  s.homepage = "https://legendapp.com"
  s.source = { :path => "." }
  s.platforms = { :osx => "14.0" }
  s.source_files = "ios/**/*.swift"
  s.frameworks = "Foundation", "Security"
  s.dependency "React-Core"
  load "nitrogen/generated/ios/RNSecureStorage+autolinking.rb"
  add_nitrogen_files(s)
end
