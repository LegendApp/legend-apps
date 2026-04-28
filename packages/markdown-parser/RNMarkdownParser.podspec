require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name = "RNMarkdownParser"
  s.version = package["version"]
  s.summary = "Legend Desktop markdown parser"
  s.license = { :type => "MIT" }
  s.author = "Legend"
  s.homepage = "https://legendapp.com"
  s.source = { :path => "." }
  s.platforms = { :ios => "15.0", :osx => "14.0" }
  s.source_files = "ios/**/*.{h,m,mm}", "vendor/md4c/src/**/*.{c,h}"
  s.preserve_paths = "vendor/md4c/LICENSE.md"
  s.dependency "React-Core"
  s.dependency "ReactCodegen"
end
