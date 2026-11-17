import { useState } from "react";
import { PlatformColor, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, SegmentedControl } from "@legendapp/spark/ui";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { canSubmitReview, type ReviewEvent, type ReviewThread } from "./github";
import { threadLines } from "./reviewThreads";
import { useSymbolColor } from "./FileRow";

export const commentDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};
const firstLine = (text: string) => text.trim().split("\n")[0] ?? "";

/** "Resolved", "Outdated" or both, for a collapsed thread. */
export const threadState = (thread: ReviewThread) => [thread.resolved ? "Resolved" : "", thread.outdated ? "Outdated" : ""].filter(Boolean).join(" · ");

/**
 * One review thread under its diff row (or above the diff when it isn't on it). Open threads show every comment and
 * Reply…; resolved and outdated ones start collapsed to one line of plain secondary text and open with a click.
 * Bodies are Markdown, shown as plain text.
 */
export function ReviewThreadView({ thread, aboveDiff, disabled, onReply }: {
  thread: ReviewThread;
  /** Not on a diff row: says which line it was on and isn't indented to the code. */
  aboveDiff?: boolean;
  disabled: boolean; onReply: (thread: ReviewThread) => void;
}) {
  const state = threadState(thread);
  const [expanded, setExpanded] = useState(!state);
  const chevron = useSymbolColor("gray");
  const first = thread.comments[0];
  const summary = [aboveDiff ? threadLines(thread) : "", state].filter(Boolean).join(" · ");
  return <View style={[styles.thread, aboveDiff && styles.aboveDiff]} accessibilityLabel={`Thread${summary ? `, ${summary}` : ""}`}>
    {state || aboveDiff ? <Pressable style={styles.summary} accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)}>
      <SFSymbol name={expanded ? "chevron.down" : "chevron.right"} color={chevron} size={10} style={styles.chevron} />
      <Text style={styles.summaryText} numberOfLines={1}>
        {summary}{!expanded && first ? `  ${first.author}: ${firstLine(first.body)}` : ""}{!expanded && thread.comments.length > 1 ? `  (${thread.comments.length} comments)` : ""}
      </Text>
    </Pressable> : null}
    {expanded ? <>
      {thread.comments.map(comment => <View key={comment.id} style={styles.comment}>
        <Text style={styles.author} numberOfLines={1}>{comment.author}<Text style={styles.date}>{`  ${commentDate(comment.createdAt)}`}</Text></Text>
        <Text style={styles.body} selectable>{comment.body.trim()}</Text>
      </View>)}
      {first && !thread.outdated ? <View style={styles.footer}><Button style={styles.reply} disabled={disabled} onPress={() => onReply(thread)}>Reply…</Button></View> : null}
    </> : null}
  </View>;
}

const reviewEvents = [{ label: "Comment", value: "COMMENT" }, { label: "Approve", value: "APPROVE" }, { label: "Request Changes", value: "REQUEST_CHANGES" }] as const;

/**
 * Add Comment…, Reply… and Review…: a sheet-style panel attached to the top of the detail with a multi-line field (and,
 * for a review, Comment / Approve / Request Changes). The pinned Spark has no window sheets and its prompt is
 * single-line, so this is drawn in the window.
 */
export function CommentSheet({ top, title, context, busy, review, onCancel, onSubmit }: {
  top: number; title: string; context: string; busy: boolean; review?: boolean; onCancel: () => void; onSubmit: (body: string, event: ReviewEvent) => void;
}) {
  const [body, setBody] = useState("");
  const [event, setEvent] = useState<ReviewEvent>("COMMENT");
  // Attached under the toolbar, like a sheet.
  return <View style={[styles.scrim, { top }]}>
    <View style={styles.sheet} accessibilityRole="none" accessibilityLabel={title}>
      <Text style={styles.sheetTitle} accessibilityRole="header">{title}</Text>
      <Text style={styles.sheetContext} numberOfLines={2}>{context}</Text>
      {review ? <SegmentedControl style={styles.events} accessibilityLabel="Review" options={reviewEvents} value={event} disabled={busy} onValueChange={value => setEvent(value as ReviewEvent)} /> : null}
      <TextInput accessibilityLabel={review ? "Summary" : "Comment"} placeholder={review ? event === "APPROVE" ? "Summary (optional, Markdown)" : "Summary (Markdown)" : "Leave a comment (Markdown)"} multiline autoFocus value={body} editable={!busy} onChangeText={setBody} style={styles.field} />
      <View style={styles.sheetButtons}>
        <Button style={styles.sheetButton} disabled={busy} onPress={onCancel}>Cancel</Button>
        <Button style={review ? styles.submitReview : styles.sheetButton} variant="default" disabled={busy || !canSubmitReview(review ? event : "COMMENT", body)} onPress={() => onSubmit(body.trim(), event)}>
          {busy ? "Posting…" : review ? "Submit Review" : "Comment"}
        </Button>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  thread: { marginLeft: 105, marginRight: 16, marginVertical: 6, paddingVertical: 4, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor"), backgroundColor: PlatformColor("controlBackgroundColor") },
  aboveDiff: { marginLeft: 16 },
  summary: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 22 },
  chevron: { width: 10, height: 10 },
  summaryText: { flex: 1, fontSize: 12, color: PlatformColor("secondaryLabelColor") },
  comment: { paddingHorizontal: 10, paddingVertical: 5, gap: 2 },
  author: { fontSize: 12, fontWeight: "600", color: PlatformColor("labelColor") },
  date: { fontSize: 11, fontWeight: "400", color: PlatformColor("secondaryLabelColor") },
  body: { fontSize: 12, lineHeight: 17, color: PlatformColor("labelColor") },
  footer: { flexDirection: "row", paddingHorizontal: 10, paddingVertical: 4 },
  reply: { width: 76, height: 24 },
  scrim: { ...StyleSheet.absoluteFillObject, alignItems: "center" },
  sheet: {
    width: 460, marginTop: 0, padding: 20, gap: 8, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, backgroundColor: PlatformColor("windowBackgroundColor"),
    borderWidth: StyleSheet.hairlineWidth, borderTopWidth: 0, borderColor: PlatformColor("separatorColor"), shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
  },
  sheetTitle: { fontSize: 13, fontWeight: "700", color: PlatformColor("labelColor") },
  sheetContext: { fontSize: 11, color: PlatformColor("secondaryLabelColor") },
  field: { height: 110, padding: 6, fontSize: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor"), backgroundColor: PlatformColor("textBackgroundColor"), color: PlatformColor("labelColor") },
  sheetButtons: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 },
  sheetButton: { width: 88, height: 24 },
  submitReview: { width: 120, height: 24 },
  events: { width: 300, height: 24, alignSelf: "center", marginVertical: 4 },
});
