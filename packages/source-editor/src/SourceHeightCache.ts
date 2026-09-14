// Compact numeric pages: no text or per-line objects, including for edit IDs
// above 2^32. Zero means unknown, never an authoritative one-line guess.
export class SourceHeightCache {
  private key = "";
  private pages = new Map<number, Float64Array>();
  private requested = new Map<number, Uint8Array>();
  private listeners = new Map<string, Set<() => void>>();
  configure(key: string, reset = false) {
    if (this.key === key && !reset) return;
    this.key = key; this.pages.clear(); this.requested.clear();
    for (const callbacks of this.listeners.values()) for (const callback of callbacks) callback();
  }
  get(key: string, id: string) {
    if (key !== this.key) return undefined;
    const number = Number(id), page = Math.floor(number / 1024);
    return this.pages.get(page)?.[number % 1024] || undefined;
  }
  getForLayout(key: string, id: string) {
    if (key !== this.key) return undefined;
    const number = Number(id), page = Math.floor(number / 1024);
    let flags = this.requested.get(page);
    if (!flags) { flags = new Uint8Array(1024); this.requested.set(page, flags); }
    flags[number % 1024] = 1;
    return this.get(key, id);
  }
  wasRequested(id: string) {
    const number = Number(id);
    return !!this.requested.get(Math.floor(number / 1024))?.[number % 1024];
  }
  set(key: string, id: string, height: number) {
    const number = Number(id);
    if (key !== this.key || !Number.isSafeInteger(number) || number < 1 || !Number.isFinite(height) || height <= 0) return false;
    if (this.get(key, id) === height) return false;
    const page = Math.floor(number / 1024);
    let values = this.pages.get(page);
    if (!values) { values = new Float64Array(1024); this.pages.set(page, values); }
    values[number % 1024] = height;
    for (const callback of this.listeners.get(id) ?? []) callback();
    return true;
  }
  invalidate(id: string) {
    const number = Number(id);
    const values = this.pages.get(Math.floor(number / 1024));
    if (values) values[number % 1024] = 0;
    for (const callback of this.listeners.get(id) ?? []) callback();
  }
  subscribe(id: string, callback: () => void) {
    let callbacks = this.listeners.get(id);
    if (!callbacks) { callbacks = new Set(); this.listeners.set(id, callbacks); }
    callbacks.add(callback);
    return () => { callbacks!.delete(callback); if (!callbacks!.size) this.listeners.delete(id); };
  }
}
