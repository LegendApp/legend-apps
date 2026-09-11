# Sourced by test-tree-sitter.sh; uses the same pinned runtime and grammar objects.
clang++ -std=c++20 -O2 -g -Wno-deprecated-declarations \
  "$syntax_root/tests/TreeSitterEditBenchmark.cpp" "$syntax_root/cpp/TreeSitterHighlighter.cpp" \
  "$tree_build/"*.o -o "$tree_build/edit-benchmark"
for repetition in 1 2 3; do
  for shape in flat nested; do
    for location in start middle end; do
      "$tree_build/edit-benchmark" "$shape" 100000 "$location" local
    done
  done
  for location in start middle end; do
    "$tree_build/edit-benchmark" file 0 "$location" local "$syntax_root/../../apps/diff/src/DiffViewerWindow.tsx"
  done
done
for shape in flat nested; do
  for kind in newline comment; do
    "$tree_build/edit-benchmark" "$shape" 100000 middle "$kind"
  done
done
for location in start middle end; do
  for kind in newline comment; do
    "$tree_build/edit-benchmark" file 0 "$location" "$kind" "$syntax_root/../../apps/diff/src/DiffViewerWindow.tsx"
  done
done
"$tree_build/edit-benchmark" flat 128 middle local
