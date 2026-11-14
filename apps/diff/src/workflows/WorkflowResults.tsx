import { useValue } from "@legendapp/state/react";
import { useEffect, useState } from "react";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StoryDescription } from "../story/StoryDescription";
import type { StoryHunk, StoryInput } from "../story/storyHunks";
import type { StoryRef } from "../story/storyContract";
import type { StorySkill } from "../story/storySkill";
import type { WorkflowPatch } from "./workflowContract";
import type { WorkflowReviewComment } from "./workflowReview";
import { workflowElapsed, workflowStore } from "./workflowStore";
import { DiffButton } from "../window/DiffControls";
import { diffSystemColor, type DiffSystemColor } from "../window/diffSystemColors";

const checkPresentation: Record<"pass" | "fail" | "warn", { symbol: string; color: DiffSystemColor; title: string }> = {
  pass: { symbol: "checkmark.circle.fill", color: "systemGreenColor", title: "Pass" },
  fail: { symbol: "xmark.octagon.fill", color: "systemRedColor", title: "Fail" },
  warn: { symbol: "exclamationmark.triangle.fill", color: "systemOrangeColor", title: "Warning" },
};
const severityPresentation: Record<WorkflowReviewComment["severity"], { symbol: string; color: DiffSystemColor }> = {
  error: { symbol: "xmark.octagon.fill", color: "systemRedColor" },
  warn: { symbol: "exclamationmark.triangle.fill", color: "systemOrangeColor" },
  info: { symbol: "info.circle.fill", color: "systemBlueColor" },
};

export function WorkflowRunRow({ windowId, skill, input, comments, focusedComment, onCommentState, onJump, onPatch, color, mutedColor }: {
  windowId: string; skill: StorySkill; input: StoryInput | null; comments: WorkflowReviewComment[]; focusedComment?: string;
  onCommentState: (id: string, state: WorkflowReviewComment["state"]) => void;
  onJump: (hunk: StoryHunk) => void; onPatch: (output: WorkflowPatch) => void; color: string; mutedColor: string;
}) {
  const run = useValue(workflowStore.state$[windowId][skill.name]);
  useEffect(() => { workflowStore.state(windowId, skill.name); }, [windowId, skill.name]);
  const [now, setNow] = useState(Date.now());
  const [showRaw, setShowRaw] = useState(false);
  const active = ["queued", "running", "cancelling"].includes(run?.status);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  if (!run) return null;
  const output = run.result?.output;
  const rowComments = comments.filter(comment => comment.skillName === skill.name);
  const focusedIndex = rowComments.findIndex(comment => comment.id === focusedComment);
  if (focusedIndex > 0) rowComments.unshift(...rowComments.splice(focusedIndex, 1));
  const stale = !!run.result && run.result.diffHash !== input?.diffHash;
  function target(ref: StoryRef) {
    const original = run.input?.hunks.find(hunk => hunk.id === ref.hunk);
    const matches = original ? input?.hunks.filter(hunk => hunk.file === original.file && hunk.hash === original.hash) : [];
    return matches?.length === 1 ? matches[0] : undefined;
  }
  return <View className="gap-3 py-4" style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: diffSystemColor("separatorColor") }}>
    <View className="flex-row flex-wrap items-center gap-3"><Text accessibilityRole="header" style={{ color, fontSize: 16, fontWeight: "600" }}>{skill.name}</Text>
      <Text accessibilityLiveRegion="polite" style={{ color: mutedColor }}>{run.status} · {Math.floor(workflowElapsed(run, now) / 1000)}s{stale ? " · Stale" : ""}</Text>
      {active ? <DiffButton title={`Cancel ${skill.name}`} label="Cancel" disabled={run.status === "cancelling"} onPress={() => workflowStore.cancel(windowId, skill.name)} /> : null}
    </View>
    {run.result ? <Text style={{ color: mutedColor, fontSize: 11 }}>{run.result.tool} / {run.result.model}</Text> : null}
    {run.progress ? <Text style={{ color: mutedColor }}>{run.progress.phase} · {run.progress.receivedBytes} bytes received</Text> : null}
    {run.error ? <Text selectable accessibilityRole="alert" style={{ color: diffSystemColor("systemRedColor") }}>{run.error.message}</Text> : null}
    {run.error?.rawOutput !== undefined ? <><DiffButton variant="borderless" title={showRaw ? "Hide raw output" : "Show raw output"} onPress={() => setShowRaw(value => !value)} />{showRaw ? <Text selectable style={{ color, fontFamily: "Menlo" }}>{run.error.rawOutput}</Text> : null}</> : null}
    {output ? <StoryDescription markdown={output.summary} color={color} /> : null}
    {output?.kind === "check" ? <>
      <View className="flex-row items-center gap-2"><SFSymbol color={diffSystemColor(checkPresentation[output.result].color)} name={checkPresentation[output.result].symbol} size={14} /><Text accessibilityLabel={`Check ${output.result}`} style={{ color, fontWeight: "600" }}>{checkPresentation[output.result].title}</Text></View>
      {output.reasons.map((reason, index) => <View key={index} className="gap-1"><StoryDescription markdown={reason.text} color={color} />{reason.refs?.map((ref, index) => {
        const hunk = target(ref);
        const title = hunk ? `Open ${hunk.file} hunk ${hunk.hunkIndex + 1}` : `Outdated reference ${ref.hunk}`;
        return <Pressable key={index} accessibilityRole="link" accessibilityLabel={title} accessibilityState={{ disabled: !hunk }} disabled={!hunk} onPress={() => { if (hunk) onJump(hunk); }} className="self-start"><Text style={{ color: hunk ? diffSystemColor("linkColor") : mutedColor, fontSize: 12 }}>{title}{hunk ? " ↗" : ""}</Text></Pressable>;
      })}</View>)}
    </> : null}
    {output?.kind === "comments" ? <>
      {!output.comments.length ? <Text style={{ color: mutedColor }}>No comments.</Text> : null}
      {rowComments.map(comment => <View key={comment.id} className="gap-2 rounded-md px-3 py-2" style={{ backgroundColor: focusedComment === comment.id ? diffSystemColor("unemphasizedSelectedContentBackgroundColor") : undefined, opacity: comment.state === "open" ? 1 : 0.6 }}>
        <View className="flex-row items-center gap-2"><SFSymbol color={diffSystemColor(severityPresentation[comment.severity].color)} name={severityPresentation[comment.severity].symbol} size={12} /><Text className="flex-1" style={{ color: mutedColor }}>{comment.severity} · {comment.file} · {comment.ref.side} {comment.ref.startLine}–{comment.ref.endLine}{comment.outdated ? " · Outdated" : ""}{comment.state !== "open" ? ` · ${comment.state}` : ""}</Text></View>
        <StoryDescription markdown={comment.body} color={color} />
        {comment.suggestion !== undefined ? <Text selectable style={{ color, fontFamily: "Menlo" }}>{comment.suggestion}</Text> : null}
        <View className="flex-row flex-wrap gap-2"><DiffButton title="Open in Files" disabled={comment.outdated} onPress={() => { const hunk = input?.hunks.find(hunk => hunk.id === comment.ref.hunk); if (hunk) onJump(hunk); }} />
          {comment.state === "open" ? <><DiffButton title="Resolve" onPress={() => onCommentState(comment.id, "resolved")} /><DiffButton title="Dismiss" onPress={() => onCommentState(comment.id, "dismissed")} /></> : <DiffButton title="Reopen" onPress={() => onCommentState(comment.id, "open")} />}
        </View>
      </View>)}
    </> : null}
    {output?.kind === "patch" ? <><StoryDescription markdown={output.description} color={color} /><DiffButton title="Review proposed patch" onPress={() => onPatch(output)} /></> : null}
    {run.result?.issues.map((issue, index) => <Text key={index} style={{ color: mutedColor }}>Reference dropped: {issue.path}: {issue.message}</Text>)}
  </View>;
}
