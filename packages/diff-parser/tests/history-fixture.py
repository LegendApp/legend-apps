"""Writes a git fast-import stream: about 2,000 commits on main with a merged side branch every 40 commits."""
import sys

out = sys.stdout.buffer
mark = 0
when = 1_700_000_000


def commit(ref, message, parents, content):
    global mark, when
    mark += 1
    when += 60
    data = message.encode()
    blob = content.encode()
    out.write(f"commit {ref}\nmark :{mark}\n".encode())
    out.write(f"author Hïstory Author <author@example.com> {when} +0000\n".encode())
    out.write(f"committer Hïstory Author <author@example.com> {when} +0000\n".encode())
    out.write(f"data {len(data)}\n".encode() + data + b"\n")
    if parents:
        out.write(f"from :{parents[0]}\n".encode())
        for parent in parents[1:]:
            out.write(f"merge :{parent}\n".encode())
    out.write(f"M 100644 inline file.txt\ndata {len(blob)}\n".encode() + blob + b"\n\n")
    return mark


head = commit("refs/heads/main", "Root commit", [], "0\n")
count = 1
while count < 2000:
    if count % 40 == 0:
        side = head
        for step in range(3):
            side = commit("refs/heads/side", f"Side {count} step {step}", [side], f"side {count} {step}\n")
        count += 3
        head = commit("refs/heads/main", f"Merge side {count}\n\nMerges the side branch.", [head, side], f"merged {count}\n")
    else:
        head = commit("refs/heads/main", f"Commit {count}", [head], f"{count}\n")
    count += 1
# A branch whose commits interleave in time with main's, then merge: --topo-order keeps each line together.
fork = head
inter = fork
for step in range(4):
    inter = commit("refs/heads/inter", f"Interleaved branch {step}", [inter], f"inter {step}\n")
    head = commit("refs/heads/main", f"Interleaved main {step}", [head], f"main {step}\n")
head = commit("refs/heads/main", "Merge interleaved branch", [head, inter], "merged inter\n")
head = commit("refs/heads/main", "Ünïcode ✓ summary line\nsecond line of the subject paragraph\n\nBody text.", [head], "unicode\n")
out.write(f"reset refs/remotes/origin/main\nfrom :{head}\n\n".encode())
out.write(f"tag v1.0\nfrom :{head}\ntagger Hïstory Author <author@example.com> {when} +0000\ndata 7\nRelease\n".encode())
out.write(f"reset refs/tags/light\nfrom :{head - 1}\n\n".encode())
