#!/usr/bin/env bash
set -euo pipefail
markdown_editor_dir="$(cd "$(dirname "$0")/.." && pwd)"
markdown_lifecycle_dir="$(mktemp -d "${TMPDIR:-/tmp}/markdown-activation.XXXXXX")"
trap 'rm -rf "$markdown_lifecycle_dir"' EXIT
node --input-type=module - "$markdown_editor_dir/ios/RNMarkdownBlockEditor.mm" "$markdown_lifecycle_dir/ActivationLifecycle.inc" <<'JS'
import fs from 'node:fs';
const source = fs.readFileSync(process.argv[2], 'utf8');
const methods = ['editorHost', 'registerWithHostIfNeeded', 'unregisterFromHost', 'viewWillMoveToSuperview:', 'viewDidMoveToSuperview', 'viewDidMoveToWindow'];
const output = [];
for (const name of methods) {
  const expression = new RegExp('^- \\([^\\n]+\\)' + name + '[^\\n]*\\n\\{', 'm');
  const match = expression.exec(source);
  // An absent window callback uses NSView behavior, allowing the pre-fix regression to run.
  if (!match && name === 'viewDidMoveToWindow') continue;
  if (!match) throw new Error(`Missing lifecycle method ${name}`);
  let end = match.index + match[0].length, depth = 1;
  for (; depth && end < source.length; end++) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
  }
  output.push(source.slice(match.index, end));
}
fs.writeFileSync(process.argv[3], output.join('\n'));
JS
clang++ -std=c++20 -fobjc-arc -framework AppKit -I"$markdown_lifecycle_dir" \
  "$markdown_editor_dir/tests/MarkdownActivationLifecycle.test.mm" -o "$markdown_lifecycle_dir/test"
"$markdown_lifecycle_dir/test"
