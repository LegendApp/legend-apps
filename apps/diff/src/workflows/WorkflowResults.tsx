import { useValue } from "@legendapp/state/react";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { StoryDescription } from "../story/StoryDescription";
import type { StoryHunk, StoryInput } from "../story/storyHunks";
import type { StoryRef } from "../story/storyContract";
import type { StorySkill } from "../story/storySkill";
import type { WorkflowPatch } from "./workflowContract";
import type { WorkflowReviewComment } from "./workflowReview";
import { workflowElapsed, workflowStore } from "./workflowStore";
import { WorkflowAction } from "./WorkflowAction";

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
  return <View className="gap-3 rounded border p-4" style={{ borderColor: mutedColor }}>
    <View className="flex-row flex-wrap items-center gap-3"><Text accessibilityRole="header" style={{ color, fontSize: 16, fontWeight: "600" }}>{skill.name}</Text>
      <Text accessibilityLiveRegion="polite" style={{ color: mutedColor }}>{run.status} · {Math.floor(workflowElapsed(run, now) / 1000)}s{stale ? " · Stale" : ""}</Text>
      {active ? <WorkflowAction title={`Cancel ${skill.name}`} color={color} disabled={run.status === "cancelling"} onPress={() => workflowStore.cancel(windowId, skill.name)} /> : null}
    </View>
    {run.result ? <Text style={{ color: mutedColor, fontSize: 11 }}>{run.result.tool} / {run.result.model}</Text> : null}
    {run.progress ? <Text style={{ color: mutedColor }}>{run.progress.phase} · {run.progress.receivedBytes} bytes received</Text> : null}
    {run.error ? <Text selectable accessibilityRole="alert" style={{ color: "#e5484d" }}>{run.error.message}</Text> : null}
    {run.error?.rawOutput !== undefined ? <><WorkflowAction title={showRaw ? "Hide raw output" : "Show raw output"} color={color} onPress={() => setShowRaw(value => !value)} />{showRaw ? <Text selectable style={{ color, fontFamily: "Menlo" }}>{run.error.rawOutput}</Text> : null}</> : null}
    {output ? <StoryDescription markdown={output.summary} color={color} /> : null}
    {output?.kind === "check" ? <>
      <View className="self-start rounded px-2 py-1" style={{ backgroundColor: output.result === "pass" ? "#187044" : output.result === "fail" ? "#b52c36" : "#855a00" }}><Text accessibilityLabel={`Check ${output.result}`} style={{ color: "#fff", fontWeight: "600" }}>{output.result === "pass" ? "✓ Pass" : output.result === "fail" ? "✕ Fail" : "! Warning"}</Text></View>
      {output.reasons.map((reason, index) => <View key={index} className="gap-1"><StoryDescription markdown={reason.text} color={color} />{reason.refs?.map((ref, index) => {
        const hunk = target(ref);
        return <WorkflowAction key={index} color={mutedColor} title={hunk ? `Open ${hunk.file} hunk ${hunk.hunkIndex + 1}` : `Outdated reference ${ref.hunk}`} disabled={!hunk} onPress={() => { if (hunk) onJump(hunk); }} />;
      })}</View>)}
    </> : null}
    {output?.kind === "comments" ? <>
      {!output.comments.length ? <Text style={{ color: mutedColor }}>No comments.</Text> : null}
      {rowComments.map(comment => <View key={comment.id} className="gap-2 rounded border p-3" style={{ borderColor: focusedComment === comment.id ? color : mutedColor, opacity: comment.state === "open" ? 1 : 0.6 }}>
        <Text style={{ color: mutedColor }}>{comment.severity} · {comment.file} · {comment.ref.side} {comment.ref.startLine}–{comment.ref.endLine}{comment.outdated ? " · Outdated" : ""}{comment.state !== "open" ? ` · ${comment.state}` : ""}</Text>
        <StoryDescription markdown={comment.body} color={color} />
        {comment.suggestion !== undefined ? <Text selectable style={{ color, fontFamily: "Menlo" }}>{comment.suggestion}</Text> : null}
        <View className="flex-row flex-wrap gap-2"><WorkflowAction title="Open in Files" color={color} disabled={comment.outdated} onPress={() => { const hunk = input?.hunks.find(hunk => hunk.id === comment.ref.hunk); if (hunk) onJump(hunk); }} />
          {comment.state === "open" ? <><WorkflowAction title="Resolve" color={color} onPress={() => onCommentState(comment.id, "resolved")} /><WorkflowAction title="Dismiss" color={mutedColor} onPress={() => onCommentState(comment.id, "dismissed")} /></> : <WorkflowAction title="Reopen" color={color} onPress={() => onCommentState(comment.id, "open")} />}
        </View>
      </View>)}
    </> : null}
    {output?.kind === "patch" ? <><StoryDescription markdown={output.description} color={color} /><WorkflowAction title="Review proposed patch" color={color} onPress={() => onPatch(output)} /></> : null}
    {run.result?.issues.map((issue, index) => <Text key={index} style={{ color: mutedColor }}>Reference dropped: {issue.path}: {issue.message}</Text>)}
  </View>;
}
