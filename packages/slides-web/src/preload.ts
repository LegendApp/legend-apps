import type { PreloadAsset } from "../preloadManifest";

type BackgroundScheduler = { postTask: (callback: () => void, options: { priority: "background" }) => Promise<void> };
function yieldToBrowser() {
  const scheduler = (globalThis as typeof globalThis & { scheduler?: BackgroundScheduler }).scheduler;
  return scheduler ? scheduler.postTask(() => {}, { priority: "background" }) : new Promise<void>(resolve => setTimeout(resolve, 100));
}

export class AssetPreloader {
  private urls = new Map<string, string>();
  private pending: PreloadAsset[];
  private controller = new AbortController();
  private running?: Promise<void>;
  readonly status = { total: 0, loaded: 0, failed: [] as string[], active: "", complete: false };

  constructor(assets: PreloadAsset[]) {
    this.pending = assets.filter((asset, index) => assets.findIndex(item => item.source === asset.source) === index);
    this.status.total = this.pending.length;
  }

  prioritize(slide: number) {
    const order = (asset: PreloadAsset) => (asset.slides ?? [asset.slide]).find(index => index >= slide) ?? Infinity;
    this.pending.sort((a, b) => order(a) - order(b) || a.slide - b.slide);
  }

  source(source: string) {
    return this.urls.get(new URL(source, document.baseURI).href) ?? source;
  }

  run() { return this.running ??= this.load(); }

  private async load() {
    while (this.pending.length && !this.controller.signal.aborted) {
      await yieldToBrowser();
      if (this.controller.signal.aborted) break;
      const asset = this.pending.shift()!;
      this.status.active = asset.source;
      try {
        const source = new URL(asset.source, document.baseURI).href;
        const response = await fetch(source, { priority: "low", signal: this.controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (this.controller.signal.aborted) break;
        if (!/\.html$/i.test(source)) this.urls.set(source, URL.createObjectURL(blob));
        this.status.loaded++;
      } catch {
        if (!this.controller.signal.aborted) this.status.failed.push(asset.source);
      }
    }
    this.status.active = "";
    this.status.complete = !this.controller.signal.aborted;
  }

  dispose() {
    this.controller.abort();
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}

let preloader: AssetPreloader | undefined;
export function preloadedSource(source: string) { return preloader?.source(source) ?? source; }
export function startPreloading(assets: PreloadAsset[], slide: number) {
  preloader = new AssetPreloader(assets);
  preloader.prioritize(slide);
  void preloader.run();
  window.addEventListener("pagehide", event => { if (!event.persisted) preloader?.dispose(); }, { once: true });
  return preloader;
}
