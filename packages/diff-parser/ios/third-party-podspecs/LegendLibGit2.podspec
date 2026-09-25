Pod::Spec.new do |s|
  s.name = "LegendLibGit2"
  s.version = "1.9.4"
  s.summary = "Pinned libgit2 build for Legend Desktop"
  s.license = { :type => "GPL-2.0-only WITH GCC-exception-2.0", :file => "COPYING" }
  s.author = "Legend"
  s.homepage = "https://libgit2.org"
  s.source = {
    :git => "https://github.com/libgit2/libgit2.git",
    :tag => "v#{s.version}",
  }
  s.platforms = { :ios => "15.0", :osx => "14.0" }
  s.preserve_paths = "**/*"
  s.vendored_libraries = "build/libgit2.a"
  s.libraries = "z", "iconv"
  s.prepare_command = <<~SH
    set -euo pipefail
    cmake -S . -B build \\
      -DCMAKE_BUILD_TYPE=Release \\
      "-DCMAKE_OSX_ARCHITECTURES=arm64;x86_64" \\
      -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0 \\
      -DBUILD_SHARED_LIBS=OFF \\
      -DBUILD_TESTS=OFF \\
      -DBUILD_CLI=OFF \\
      -DUSE_SSH=OFF \\
      -DUSE_HTTPS=OFF \\
      -DUSE_BUNDLED_ZLIB=OFF
    cmake --build build --target libgit2package -- -j4
  SH
  s.pod_target_xcconfig = {
    "HEADER_SEARCH_PATHS" => [
      "$(PODS_TARGET_SRCROOT)/build/include",
      "$(PODS_TARGET_SRCROOT)/build/gen_headers",
    ].join(" "),
  }
end
