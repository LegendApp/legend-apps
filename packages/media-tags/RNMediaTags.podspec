require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name = "RNMediaTags"
  s.version = package["version"]
  s.summary = "Legend Desktop media tag helpers"
  s.license = { :type => "MIT" }
  s.author = "Legend"
  s.homepage = "https://legendapp.com"
  s.source = { :path => "." }
  s.platforms = { :ios => "15.0", :osx => "14.0" }
  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.public_header_files = "ios/RNMediaTagsCore.h"
  s.swift_version = "6.0"
  s.dependency "React-Core"
  s.dependency "ReactCodegen"
  s.dependency "ID3TagEditor", "5.5.0"
  s.frameworks = "AVFoundation", "AudioToolbox", "ImageIO"
end
