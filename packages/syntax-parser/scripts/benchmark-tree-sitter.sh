# Sourced by test-tree-sitter.sh after compiling pinned C runtime/grammars.
syntax_headers="$syntax_root/../../shell/.legend/workspaces/dev/code/macos/Pods/Headers"
textmate_root="$syntax_root/vendor/TextMateLib"
clang++ -std=c++20 -O2 -framework CoreFoundation \
  -I"$syntax_headers/Public" -I"$syntax_headers/Public/NitroModules" -I"$syntax_headers/Private/NitroModules" \
  -I"$syntax_headers/Public/React-jsi" -I"$syntax_headers/Public/ReactCommon" -I"$syntax_headers/Public/React-callinvoker" \
  -I"$textmate_root/packages/tml-cpp/build" \
  "$syntax_root/tests/SyntaxBackendBenchmark.cpp" "$syntax_root/cpp/TreeSitterHighlighter.cpp" \
  "$syntax_root/cpp/SyntaxHighlighter.cpp" "$syntax_root/cpp/IncrementalSyntaxHighlighter.cpp" \
  "$textmate_root/packages/tml-cpp/build/libtml.a" "$textmate_root/packages/tml-cpp/build/oniguruma/lib/libonig.a" \
  "$tree_build/"*.o -o "$tree_build/benchmark"
for repetition in 1 2 3; do
  for language in typescript tsx; do
    for fixture in repeated unique; do
      for lines in 10000 100000; do
        # Independent processes for peak RSS; alternate order between repetitions.
        backends="textmate tree-sitter"
        if [ "$repetition" = 2 ]; then backends="tree-sitter textmate"; fi
        for backend in $backends; do
          "$tree_build/benchmark" "$backend" "$language" "$fixture" "$lines" "$textmate_root/thirdparty/textmate-grammars-themes/packages"
        done
      done
    done
  done
done
