require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name = "RNKeyboardManager"
  s.version = package["version"]
  s.summary = "Legend Desktop focused keyboard event monitor"
  s.license = { :type => "MIT" }
  s.author = "Legend"
  s.homepage = "https://legendapp.com"
  s.source = { :path => "." }
  s.platforms = { :ios => "15.0", :osx => "14.0" }
  s.source_files = "ios/**/*.{h,m,mm}"
  s.osx.frameworks = "AppKit", "Carbon"
  s.dependency "React-Core"
  s.dependency "ReactCodegen"
end
