"""Reads `git blame --porcelain` on stdin; prints "oid path origLine" per final line ("-" = not committed)."""
import re
import sys

paths, out = {}, []
lines = sys.stdin.read().split("\n")
for index, line in enumerate(lines):
    match = re.match(r"^([0-9a-f]{40}) (\d+) (\d+)", line)
    if not match:
        continue
    oid, orig = match.group(1), match.group(2)
    for following in lines[index + 1:]:
        if following.startswith("\t"):
            break
        if following.startswith("filename "):
            paths[oid] = following[9:]
    out.append(f"{oid if oid.strip('0') else '-'} {paths[oid]} {orig}")
print("\n".join(out))
