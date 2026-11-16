#!/usr/bin/env bash
# Builds a repository whose file was renamed, edited on two branches (one moving a line) and merged,
# with staged and unstaged edits; writes `git blame --porcelain` as "oid path origLine" per line.
set -euo pipefail
FIXTURE="$1"
rm -rf "$FIXTURE"
git init --quiet --initial-branch=main "$FIXTURE"
g() { git -C "$FIXTURE" -c user.name="Blame Test" -c user.email=blame@example.test -c commit.gpgsign=false "$@"; }
for n in $(seq 1 20); do echo "line $n of the original file"; done > "$FIXTURE/a.txt"
g add a.txt; g commit --quiet -m "Add a.txt"
g mv a.txt b.txt; g commit --quiet -m "Rename a.txt to b.txt"
g switch --quiet -c side
python3 - "$FIXTURE/b.txt" <<'PY'
import sys
path = sys.argv[1]
lines = open(path).read().splitlines(True)
moved = lines.pop(17)                 # line 18 moves up, after line 10
lines.insert(10, moved)
lines[15] = "line 15 changed on side\n"
open(path, "w").write("".join(lines))
PY
g commit --quiet -am "Move line 18 and change line 15 on side"
g switch --quiet main
sed -i '' 's/^line 3 of the original file$/line 3 changed on main/' "$FIXTURE/b.txt"
g commit --quiet -am "Change line 3 on main"
g merge --quiet --no-ff -m "Merge side" side
sed -i '' 's/^line 13 of the original file$/line 13 staged/' "$FIXTURE/b.txt"
g add b.txt
sed -i '' 's/^line 12 of the original file$/line 12 unstaged/' "$FIXTURE/b.txt"
echo "a new last line" >> "$FIXTURE/b.txt"
# Unstaged deletions at the top and mid-file (deletion-only hunks) and an insertion mid-file.
sed -i '' -e '/^line 1 of the original file$/d' -e '/^line 6 of the original file$/d' -e 's/^line 8 of the original file$/line 8 of the original file\
an inserted line/' "$FIXTURE/b.txt"

# A file checked out with CRLF line endings (eol=crlf) blames as committed, not as all changed.
CRLF="$FIXTURE-crlf"
rm -rf "$CRLF"
git init --quiet --initial-branch=main "$CRLF"
c() { git -C "$CRLF" -c user.name="Blame Test" -c user.email=blame@example.test -c commit.gpgsign=false "$@"; }
echo "*.txt text eol=crlf" > "$CRLF/.gitattributes"
printf 'one\ntwo\nthree\n' > "$CRLF/c.txt"
c add .gitattributes c.txt; c commit --quiet -m "Add c.txt"
rm "$CRLF/c.txt"; c checkout -- c.txt
printf 'one\r\nTWO\r\nthree\r\n' > "$CRLF/c.txt"
git -C "$CRLF" blame --porcelain -- c.txt | python3 "$(dirname "${BASH_SOURCE[0]}")/blame-porcelain.py" > "$CRLF.workdir"

porcelain() { python3 "$(dirname "${BASH_SOURCE[0]}")/blame-porcelain.py"; }
g blame --porcelain HEAD -- b.txt | porcelain > "$FIXTURE.head"
g blame --porcelain side -- b.txt | porcelain > "$FIXTURE.side"
g blame --porcelain -- b.txt | porcelain > "$FIXTURE.workdir"
g show :b.txt > "$FIXTURE.staged-contents"
g blame --porcelain --contents "$FIXTURE.staged-contents" -- b.txt | porcelain > "$FIXTURE.index"
g rev-parse side > "$FIXTURE.side-oid"
