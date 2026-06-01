require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name = "RNAudioPlayer"
  s.version = package["version"]
  s.summary = "Legend Desktop audio playback helpers"
  s.license = { :type => "MIT" }
  s.author = "Legend"
  s.homepage = "https://legendapp.com"
  s.source = { :path => "." }
  s.platforms = { :ios => "15.0", :osx => "14.0" }
  s.source_files = "ios/**/*.{h,m,mm}"
  s.frameworks = "AVFoundation", "MediaPlayer"
  s.dependency "React-Core"
  s.dependency "ReactCodegen"
end
