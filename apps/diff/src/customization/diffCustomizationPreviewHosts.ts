export function createDiffCustomizationPreviewHosts(hosts: Record<string, unknown>, samplePath: string) {
  const blocked = () => { throw new Error("This action is unavailable in a customization preview. Keep the change to use it with your files."); };
  const modules = { ...hosts };
  function replace(name: string, methods: Record<string, unknown>) {
    modules[name] = { ...hosts[name] as object, ...methods };
  }
  const parser = hosts["@legend-apps/diff-parser"] as Record<string, (...args: any[]) => unknown>;
  replace("@legend-apps/diff-parser", {
    startGitFolderDiff: blocked, loadUnifiedDiffFromUrl: blocked, startUnifiedDiffFromUrl: blocked,
    loadUnifiedDiffFile: (file: string, ...args: unknown[]) => file === samplePath ? parser.loadUnifiedDiffFile!(file, ...args) : blocked(),
  });
  const processes = hosts["@legendapp/spark/processes"] as Record<string, unknown>;
  replace("@legendapp/spark/processes", Object.fromEntries(Object.keys(processes).filter(name => !["getProcessAvailability", "resolveCommand"].includes(name)).map(name => [name, blocked])));
  replace("diff-host/diffMerge", { writeDiffMergeFileContent: blocked, readDiffMergeFileContent: blocked });
  replace("diff-host/diffFiles", { openDiffFilePairDialog: blocked, openDiffFolderDialog: blocked });
  const metadata = hosts["diff-host/diffAppMetadata"] as Record<string, unknown>;
  replace("diff-host/diffAppMetadata", Object.fromEntries(Object.keys(metadata).filter(name => /^(add|upsert|update|remove)/.test(name)).map(name => [name, () => {}])));
  const files = hosts["@legendapp/spark/files"] as Record<string, unknown>;
  replace("@legendapp/spark/files", Object.fromEntries(Object.keys(files).filter(name => /^(write|move|copy|remove|mkdir|open|delete)/.test(name)).map(name => [name, blocked])));
  return modules;
}
