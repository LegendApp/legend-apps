"""Writes a git fast-import stream for graph lanes: a merged feature, an octopus merge, an unrelated
history merged in (a root in the middle), and a branch that forks and never merges back."""
import sys

out = sys.stdout.buffer
mark = 0
when = 1_700_000_000


def commit(ref, message, parents):
    global mark, when
    mark += 1
    when += 60
    data = message.encode()
    blob = f"{message}\n".encode()
    out.write(f"commit {ref}\nmark :{mark}\n".encode())
    out.write(f"author Graph <graph@example.com> {when} +0000\ncommitter Graph <graph@example.com> {when} +0000\n".encode())
    out.write(f"data {len(data)}\n".encode() + data + b"\n")
    if parents:
        out.write(f"from :{parents[0]}\n".encode())
        for parent in parents[1:]:
            out.write(f"merge :{parent}\n".encode())
    out.write(f"M 100644 inline {ref.rsplit('/', 1)[-1]}.txt\ndata {len(blob)}\n".encode() + blob + b"\n\n")
    return mark


root = commit("refs/heads/main", "Root", [])
a1 = commit("refs/heads/main", "A1", [root])
f1 = commit("refs/heads/feature", "F1", [a1])
a2 = commit("refs/heads/main", "A2", [a1])
stale = commit("refs/heads/stale", "Stale 1", [a2])
commit("refs/heads/stale", "Stale 2", [stale])
f2 = commit("refs/heads/feature", "F2", [f1])
m1 = commit("refs/heads/main", "Merge feature", [a2, f2])
arms = [commit(f"refs/heads/arm{index}", f"Arm {index}", [m1]) for index in range(3)]
b1 = commit("refs/heads/main", "B1", [m1])
octopus = commit("refs/heads/main", "Octopus", [b1, *arms])
u0 = commit("refs/heads/unrelated", "Unrelated root", [])
u1 = commit("refs/heads/unrelated", "Unrelated 1", [u0])
u2 = commit("refs/heads/unrelated", "Unrelated 2", [u1])
m2 = commit("refs/heads/main", "Merge unrelated", [octopus, u2])
commit("refs/heads/main", "Tip", [m2])
