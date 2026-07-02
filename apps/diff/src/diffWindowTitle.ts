import { getDiffSourceLabel, type DiffOpenSource } from "./diffFiles";

const dirtyTitleIndicator = "•";
const cleanTitlePadding = "  ";

export function diffViewerWindowTitle({
  hasUnsavedMergeDrafts,
  source,
}: {
  hasUnsavedMergeDrafts: boolean;
  source: DiffOpenSource | null;
}) {
  const title = getDiffSourceLabel(source);
  return hasUnsavedMergeDrafts ? `${title} ${dirtyTitleIndicator}` : `${title}${cleanTitlePadding}`;
}
