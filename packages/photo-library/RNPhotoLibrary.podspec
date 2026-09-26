require "json"
package = JSON.parse(File.read(File.join(__dir__, "package.json")))
Pod::Spec.new do |s|
  s.name = "RNPhotoLibrary"
  s.version = package["version"]
  s.summary = "PhotoKit access for Legend Photos"
  s.license = { :type => "MIT" }
  s.author = "Legend"
  s.homepage = "https://legendapp.com"
  s.source = { :path => "." }
  s.platforms = { :osx => "14.0" }
  s.source_files = "macos/**/*.{h,m,mm,swift}"
  s.swift_version = "5.0"
  s.dependency "React-Core"
  s.dependency "ReactCodegen"
  s.frameworks = "Photos", "AppKit"
end
