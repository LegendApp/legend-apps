require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name = "RNAppleMusic"
  s.version = package["version"]
  s.summary = "MusicKit authorization and playback for Legend apps"
  s.license = { :type => "MIT" }
  s.author = "Legend"
  s.homepage = "https://legendapp.com"
  s.source = { :path => "." }
  s.platforms = { :osx => "14.0" }
  s.source_files = "ios/**/*.swift"
  s.frameworks = "Foundation", "MusicKit", "CoreAudio", "AudioToolbox"
  s.dependency "React-Core"
  load "nitrogen/generated/ios/RNAppleMusic+autolinking.rb"
  add_nitrogen_files(s)
end
