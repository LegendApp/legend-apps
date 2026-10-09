import { useValue } from "@legendapp/state/react";
import type { AssetPreloader } from "./preload";

export function PreloadStatus({ preloader }: { preloader: AssetPreloader }) {
  const { loaded, total, failed, complete } = useValue(preloader.status$);
  if (!total) return null;
  const ready = complete && !failed.length;
  const title = failed.length
    ? `${failed.length} files could not be prepared. They will load when their slides open.`
    : ready ? "All media is ready. The browser can reuse cached downloads on your next visit." : "Preparing media in the background.";
  return <div className="preload-status" data-ready={ready} title={title}>
    <span role="status" aria-live="polite" aria-atomic="true">{ready ? "Media ready" : complete ? "Media partly ready" : "Loading media"} · {loaded}/{total}</span>
    <progress aria-label="Media preload progress" value={loaded} max={total} />
  </div>;
}
