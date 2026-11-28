function changedRange(before: string, after: string) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = before.length;
  let afterEnd = after.length;
  while (end > start && afterEnd > start && before[end - 1] === after[afterEnd - 1]) {
    end--;
    afterEnd--;
  }
  return { start, end, replacement: after.slice(start, afterEnd) };
}

export function mapTypingOffset(before: string, after: string, offset: number) {
  const change = changedRange(before, after);
  if (offset < change.start) return offset;
  if (offset >= change.end) return offset + change.start + change.replacement.length - change.end;
  return change.start + Math.min(offset - change.start, change.replacement.length);
}

/** Apply a native input's edit to the latest version of its block. */
export function mergeTypingEdit(before: string, after: string, latest: string) {
  if (latest === before) return after;
  if (before === after) return latest;

  const local = changedRange(before, after);
  const peer = changedRange(before, latest);
  const peerEnd = peer.start + peer.replacement.length;
  const shift = peerEnd - peer.end;
  if (local.start >= peer.end) {
    return latest.slice(0, local.start + shift) + local.replacement + latest.slice(local.end + shift);
  }
  if (local.end <= peer.start) {
    return latest.slice(0, local.start) + local.replacement + latest.slice(local.end);
  }
  if (local.start === local.end) return latest.slice(0, peerEnd) + local.replacement + latest.slice(peerEnd);
  // The later edit replaces the overlapping range. Keep both untouched sides.
  const start = Math.min(local.start, peer.start);
  const end = local.end >= peer.end ? local.end + shift : peerEnd;
  return latest.slice(0, start) + local.replacement + latest.slice(end);
}
