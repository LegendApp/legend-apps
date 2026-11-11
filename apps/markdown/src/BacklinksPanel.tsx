import type { MarkdownDocumentCommands } from "@legend-apps/markdown-document";
import { Pressable, ScrollView, Text, View } from "react-native";
import { getFilename } from "./markdownFiles";
import type { NoteMention, NoteMentions, VaultLinkIndex } from "./markdownLinkIndex";

type BacklinksPanelProps = {
  onOpenMention: (source: string, mention: NoteMention) => void;
  target: string | null;
  /** A new object whenever the index changes, so memoized renders see the update. */
  vault: { index: VaultLinkIndex | null };
};

/** How many times `mention.text` occurs before it in `text`, case-insensitively, as Find counts matches. */
function getOccurrence(text: string, mention: NoteMention) {
  const haystack = text.toLocaleLowerCase(), needle = mention.text.toLocaleLowerCase();
  let count = 0;
  for (let at = haystack.indexOf(needle); at >= 0 && at < mention.start; at = haystack.indexOf(needle, at + needle.length)) count++;
  return count;
}

/** Selects a mention in the open document with Find, which matches the same text in order. */
export async function revealMention(commands: MarkdownDocumentCommands, text: string, mention: NoteMention) {
  if (!await commands.find(mention.text, false, true)) return;
  for (let skip = getOccurrence(text, mention); skip > 0; skip--) await commands.find(mention.text);
}

function MentionGroups({ groups, onOpenMention }: { groups: NoteMentions[]; onOpenMention: BacklinksPanelProps["onOpenMention"] }) {
  return groups.map(({ mentions, source }) => (
    <View className="gap-1" key={source}>
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 font-semibold text-foreground" numberOfLines={1}>{getFilename(source)}</Text>
        <Text className="text-muted">{mentions.length}</Text>
      </View>
      {mentions.map(mention => (
        <Pressable accessibilityRole="button" className="rounded px-2 py-1" key={mention.start} onPress={() => onOpenMention(source, mention)}>
          <Text className="text-muted" numberOfLines={3}>
            {mention.context.slice(0, mention.start - mention.contextStart).trimStart()}
            <Text className="font-semibold text-foreground">{mention.text}</Text>
            {mention.context.slice(mention.end - mention.contextStart).trimEnd()}
          </Text>
        </Pressable>
      ))}
    </View>
  ));
}

/** Obsidian-style backlinks for the active note: other notes in the vault that link to it. */
export function BacklinksPanel({ onOpenMention, target, vault }: BacklinksPanelProps) {
  const { index } = vault;
  const linked = index && target ? index.linkedMentions(target) : [];
  return (
    <View className="w-72 border-l border-border bg-background" testID="backlinks-panel">
      <ScrollView contentContainerStyle={{ gap: 12, padding: 12 }}>
        <Text className="font-semibold text-foreground">Linked mentions {index ? linked.reduce((sum, group) => sum + group.mentions.length, 0) : ""}</Text>
        {!target ? <Text className="text-muted">Save the document in a folder to see backlinks.</Text>
          : !index ? <Text className="text-muted">Indexing…</Text>
          : linked.length === 0 ? <Text className="text-muted">No backlinks found.</Text>
          : <MentionGroups groups={linked} onOpenMention={onOpenMention} />}
      </ScrollView>
    </View>
  );
}
