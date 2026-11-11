import { readText, watch } from "@legendapp/spark/files";
import { ownRegistration } from "@legend-apps/runtime-utils";
import { isIgnored, listWorkspaceDirectory, type IgnoreScope } from "@legend-apps/workspace";
import { useEffect, useState } from "react";
import { VaultLinkIndex } from "./markdownLinkIndex";
import { getDirectory, getFilename, isMarkdownPath } from "./markdownFiles";

const readBatchSize = 32;

/** Folder → the .gitignore scopes that apply inside it, for checking files that appear later. */
export type VaultScopes = Map<string, IgnoreScope[]>;

/** Walks the vault with the sidebar's listing rules and reads every Markdown note, a batch at a time. */
export async function scanVault(root: string, isCancelled: () => boolean = () => false) {
  const index = new VaultLinkIndex(root);
  const scopes: VaultScopes = new Map();
  const files: string[] = [];
  const queue: { directory: string; parentScopes: IgnoreScope[] }[] = [{ directory: root, parentScopes: [] }];
  while (queue.length > 0 && !isCancelled()) {
    const { directory, parentScopes } = queue.shift()!;
    const listing = await listWorkspaceDirectory(directory, parentScopes).catch(() => null);
    if (!listing) continue;
    scopes.set(directory, listing.scopes);
    for (const entry of listing.entries) {
      if (entry.isDirectory) queue.push({ directory: entry.path, parentScopes: listing.scopes });
      else if (isMarkdownPath(entry.path)) files.push(entry.path);
    }
  }
  for (let start = 0; start < files.length && !isCancelled(); start += readBatchSize) {
    const batch = files.slice(start, start + readBatchSize);
    const texts = await Promise.all(batch.map(path => readText(path).catch(() => null)));
    batch.forEach((path, i) => { if (texts[i] !== null) index.set(path, texts[i]); });
  }
  return { index, scopes };
}

async function readIntoIndex(index: VaultLinkIndex, path: string) {
  const text = await readText(path).catch(() => null);
  if (text === null) index.delete(path);
  else index.set(path, text);
}

/**
 * Applies one watch event, which may name a changed note or just its folder. Returns false when the change needs a
 * full rescan: a new or removed folder, or a changed .gitignore.
 */
export async function updateVaultPath(index: VaultLinkIndex, scopes: VaultScopes, path: string) {
  const parent = getDirectory(path);
  const parentScopes = parent ? scopes.get(parent) : undefined;
  if (!parentScopes && !scopes.has(path)) {
    // Outside the scanned folders: ignore changes under an ignored folder, rescan for a new one.
    let child = path, ancestor = getDirectory(child);
    while (ancestor && !scopes.has(ancestor)) [child, ancestor] = [ancestor, getDirectory(ancestor)];
    return !!ancestor && isIgnored(scopes.get(ancestor)!, child, true);
  }
  if (isMarkdownPath(path)) {
    if (!parentScopes) return false;
    if (!isIgnored(parentScopes, path, false)) await readIntoIndex(index, path);
    return true;
  }
  const directoryScopes = scopes.get(path);
  if (!directoryScopes) return parentScopes !== undefined && getFilename(path) !== ".gitignore";
  const listing = await listWorkspaceDirectory(path, parentScopes ?? []).catch(() => null);
  if (!listing || listing.entries.some(entry => entry.isDirectory && !scopes.has(entry.path))) return false;
  const notes = listing.entries.filter(entry => !entry.isDirectory && isMarkdownPath(entry.path)).map(entry => entry.path);
  for (const indexed of [...index.paths()]) {
    if (getDirectory(indexed) === path && !notes.includes(indexed)) index.delete(indexed);
  }
  await Promise.all(notes.map(note => readIntoIndex(index, note)));
  return true;
}

/**
 * Indexes the vault in the background and keeps it current as files change on disk, including saves from this app.
 * `version` changes whenever the index does.
 */
export function useVaultLinkIndex(root: string | null, onError: (error: unknown) => void) {
  const [state, setState] = useState<{ index: VaultLinkIndex | null; version: number }>({ index: null, version: 0 });
  useEffect(() => {
    setState(previous => ({ index: null, version: previous.version + 1 }));
    if (!root) return;
    let active = true;
    let current: Awaited<ReturnType<typeof scanVault>> | null = null;
    let pending = new Set<string>();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const publish = () => { if (active && current) setState(previous => ({ index: current!.index, version: previous.version + 1 })); };
    const rescan = () => scanVault(root, () => !active).then(result => { current = result; publish(); });
    const flush = async () => {
      const paths = pending;
      pending = new Set();
      if (!current) return;
      const results = await Promise.all([...paths].map(path => updateVaultPath(current!.index, current!.scopes, path)));
      if (results.includes(false)) await rescan();
      else publish();
    };
    rescan().catch(onError);
    const subscription = ownRegistration(watch(root, path => {
      if (!active) return;
      pending.add(path);
      clearTimeout(timeout);
      timeout = setTimeout(() => { flush().catch(onError); }, 150);
    }, { recursive: true }), onError);
    return () => {
      active = false;
      clearTimeout(timeout);
      void subscription.remove().catch(onError);
    };
  }, [onError, root]);
  return state;
}
