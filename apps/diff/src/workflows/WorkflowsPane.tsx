import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { repoSkillNotice } from "../story/skillTrust";
import type { StoryHunk } from "../story/storyHunks";
import { workflowPrivacyNotice, workflowStore } from "./workflowStore";
import { WorkflowRunRow } from "./WorkflowResults";
import { WorkflowAction } from "./WorkflowAction";
import { WorkflowPatchPane, type WorkflowPatchViewerProps, type WorkflowProposal } from "./WorkflowPatchPane";
import type { useDiffWorkflows } from "./useDiffWorkflows";
import type { WorkflowReviewComment } from "./workflowReview";

export function WorkflowsPane({ controller, focusedComment, onJump, onReload, settings, ...viewer }: WorkflowPatchViewerProps & {
  controller: ReturnType<typeof useDiffWorkflows>; focusedComment: WorkflowReviewComment | null; onJump: (hunk: StoryHunk) => void;
  onReload: () => void; settings: WorkflowProposal["settings"];
}) {
  const [proposal, setProposal] = useState<(WorkflowProposal & { skillName: string }) | null>(null);
  const [applied, setApplied] = useState(false);
  const list = useRef<ScrollView | null>(null);
  const positions = useRef(new Map<string, number>());
  const color = viewer.foregroundColor;
  useEffect(() => { setProposal(null); setApplied(false); }, [controller.source]);
  useEffect(() => {
    if (focusedComment) list.current?.scrollTo({ y: positions.current.get(focusedComment.skillName) ?? 0, animated: true });
  }, [focusedComment]);
  if (proposal) return <WorkflowPatchPane {...viewer} proposal={proposal} currentHash={controller.input?.diffHash} onClose={() => setProposal(null)}
    onDiscard={() => { workflowStore.discard(controller.windowId, proposal.skillName, proposal.output); setProposal(null); }}
    onApplied={() => { setProposal(null); setApplied(true); onReload(); }} />;
  return <ScrollView ref={list} className="flex-1" contentContainerStyle={{ paddingTop: 64, paddingHorizontal: 20, paddingBottom: 20, gap: 16 }}>
    <Text accessibilityRole="header" style={{ color, fontSize: 24, fontWeight: "600" }}>Workflows</Text>
    <Text style={{ color: viewer.mutedColor }}>Select workflows in the sidebar and run them with your signed-in AI CLI. Results stay local; proposed patches wait for your review.</Text>
    <View className="flex-row flex-wrap gap-2">{(["codex", "claude"] as const).map(tool => <WorkflowAction key={tool} color={color} title={`${controller.tool === tool ? "✓ " : ""}${tool === "codex" ? "Codex" : "Claude"}`} onPress={() => controller.setTool(tool)} />)}</View>
    {!controller.ready ? <Text style={{ color: viewer.mutedColor }}>Preparing workflows…</Text> : null}
    {controller.ready && !controller.skills.length ? <Text style={{ color: viewer.mutedColor }}>No workflow skills are available.</Text> : null}
    {controller.error ? <Text selectable accessibilityRole="alert" style={{ color: "#e5484d" }}>{controller.error}</Text> : null}
    {controller.skillErrors.map((error, index) => <Text key={index} selectable style={{ color: viewer.mutedColor }}>{error}</Text>)}
    {applied ? <Text accessibilityLiveRegion="polite" style={{ color }}>Patch applied to working files. Refreshing the original diff…</Text> : null}
    {controller.pending ? <View className="gap-2 rounded border p-3" style={{ borderColor: color }}>
      <Text style={{ color }}>{controller.pending.type === "trust" ? repoSkillNotice(controller.pending.request.skill) : workflowPrivacyNotice(controller.pending.request.tool)}</Text>
      {controller.pending.type === "trust" ? <Text selectable style={{ color: viewer.mutedColor, fontFamily: "Menlo" }}>{controller.pending.request.skill.markdown}</Text> : null}
      <View className="flex-row gap-2"><WorkflowAction title={controller.pending.type === "trust" ? "Approve this skill" : "Enable and run"} color={color} onPress={() => controller.approve(true)} /><WorkflowAction title="Don't run" color={viewer.mutedColor} onPress={() => controller.approve(false)} /></View>
    </View> : null}
    {controller.skills.map(skill => <View key={skill.name} onLayout={event => {
      const y = event.nativeEvent.layout.y;
      positions.current.set(skill.name, y);
      if (focusedComment?.skillName === skill.name) list.current?.scrollTo({ y, animated: true });
    }}>
      <WorkflowRunRow windowId={controller.windowId} skill={skill} input={controller.input} comments={controller.comments} focusedComment={focusedComment?.id}
        onCommentState={controller.setCommentState} onJump={onJump} color={color} mutedColor={viewer.mutedColor}
        onPatch={output => { if (controller.source) setProposal({ output, source: controller.source, repoRoot: controller.repoRoot, settings, skillName: skill.name }); }} />
    </View>)}
  </ScrollView>;
}
