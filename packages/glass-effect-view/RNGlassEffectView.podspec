require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name = "RNGlassEffectView"
  s.version = package["version"]
  s.summary = "Legend Desktop glass effect view"
  s.license = { :type => "MIT" }
  s.author = "Legend"
  s.homepage = "https://legendapp.com"
  s.source = { :path => "." }
  s.platforms = { :ios => "15.0", :osx => "14.0" }
  s.source_files = "ios/**/*.{m,swift}"
  s.swift_version = "6.0"
  s.dependency "React-Core"
end
