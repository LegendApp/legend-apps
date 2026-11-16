export type GitStatusEntry = {
  kind: "ordinary" | "renamed" | "copied" | "unmerged" | "untracked";
  path: string;
  indexStatus: string;
  worktreeStatus: string;
  submodule?: string;
  originalPath?: string;
  score?: string;
  modes?: string[];
  oids?: string[];
};

export type GitStatus = {
  entries: GitStatusEntry[];
  branch: {
    oid: string | null;
    head: string | null;
    upstream: string | null;
    ahead: number;
    behind: number;
  };
};

function fieldsWithPath(record: string, count: number) {
  const fields: string[] = [];
  let start = 0;
  for (let index = 0; index < count; index += 1) {
    const end = record.indexOf(" ", start);
    if (end < 0) throw new Error("Malformed Git porcelain v2 record.");
    fields.push(record.slice(start, end));
    start = end + 1;
  }
  fields.push(record.slice(start));
  return fields;
}

export function parseGitStatus(output: string): GitStatus {
  const result: GitStatus = {
    entries: [],
    branch: { oid: null, head: null, upstream: null, ahead: 0, behind: 0 },
  };
  const records = output.split("\0");
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    if (record.startsWith("# branch.oid ")) result.branch.oid = record.slice(13);
    else if (record.startsWith("# branch.head ")) result.branch.head = record.slice(14);
    else if (record.startsWith("# branch.upstream ")) result.branch.upstream = record.slice(18);
    else if (record.startsWith("# branch.ab ")) {
      const [ahead, behind] = record.slice(12).split(" ");
      result.branch.ahead = Number(ahead?.slice(1) ?? 0);
      result.branch.behind = Number(behind?.slice(1) ?? 0);
    } else if (record.startsWith("? ")) {
      result.entries.push({ kind: "untracked", path: record.slice(2), indexStatus: "?", worktreeStatus: "?" });
    } else if (record.startsWith("1 ") || record.startsWith("2 ") || record.startsWith("u ")) {
      const unmerged = record[0] === "u";
      const renamed = record[0] === "2";
      const fields = fieldsWithPath(record, unmerged ? 10 : renamed ? 9 : 8);
      const xy = fields[1]!;
      const entry: GitStatusEntry = {
        kind: unmerged ? "unmerged" : renamed ? (fields[8]!.startsWith("C") ? "copied" : "renamed") : "ordinary",
        path: fields[fields.length - 1]!,
        indexStatus: xy[0]!,
        worktreeStatus: xy[1]!,
        submodule: fields[2],
        modes: fields.slice(3, unmerged ? 7 : 6),
        oids: fields.slice(unmerged ? 7 : 6, unmerged ? 10 : 8),
      };
      if (renamed) {
        const originalPath = records[++index];
        if (!originalPath) throw new Error("Missing original path in Git rename/copy record.");
        entry.originalPath = originalPath;
        entry.score = fields[8];
      }
      result.entries.push(entry);
    }
  }
  return result;
}
