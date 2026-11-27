import { useState } from "react";
import { Pressable, Text } from "react-native";
import { openFileDialog } from "@legendapp/spark/dialogs";
import { readText } from "@legendapp/spark/files";
import { SettingsRow, SettingsSection, SettingsSwitchRow } from "@legendapp/spark/ui/settings";
import { parseMarkdownPluginManifest, parseMarkdownPreset } from "../markdownPlugins";
import {
  applyMarkdownPreset,
  getMarkdownInstalledPlugins,
  installMarkdownPlugin,
  setMarkdownPluginEnabled,
  useMarkdownInstalledPlugins,
} from "../markdownSettings";

async function readChosenJson(): Promise<string | undefined> {
  const result = await openFileDialog({ filters: [{ extensions: ["json"] }], selection: "files" });
  const path = result.canceled ? undefined : result.paths[0];
  return path ? readText(path) : undefined;
}

function ChooseButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className="h-7 justify-center rounded-md px-2.5 hover:bg-background-secondary/60 active:bg-background-secondary"
      onPress={onPress}
    >
      <Text className="text-text-secondary">{label}</Text>
    </Pressable>
  );
}

export function PluginSettingsSection() {
  const plugins = useMarkdownInstalledPlugins();
  const [status, setStatus] = useState<string>();
  const run = (action: () => Promise<string | undefined>) => {
    action().then(setStatus, (error: unknown) => setStatus(error instanceof Error ? error.message : String(error)));
  };

  return (
    <SettingsSection title="Plugins">
      <SettingsRow
        description={status ?? "Install a local plugin manifest, then import a preset that configures its rules and toolbar."}
        label="Local Plugins"
      >
        <ChooseButton
          label="Install Plugin…"
          onPress={() => run(async () => {
            const source = await readChosenJson();
            if (!source) return undefined;
            const manifest = parseMarkdownPluginManifest(source);
            installMarkdownPlugin(manifest);
            return `Installed ${manifest.name} ${manifest.version}`;
          })}
        />
        <ChooseButton
          label="Import Preset…"
          onPress={() => run(async () => {
            const source = await readChosenJson();
            if (!source) return undefined;
            applyMarkdownPreset(parseMarkdownPreset(source, getMarkdownInstalledPlugins().map(({ manifest }) => manifest)));
            return "Imported preset";
          })}
        />
      </SettingsRow>
      {plugins.map(({ enabled, manifest }) => (
        <SettingsSwitchRow
          description={`${manifest.id} ${manifest.version}`}
          key={manifest.id}
          label={manifest.name}
          value={enabled}
          onValueChange={(checked) => setMarkdownPluginEnabled(manifest.id, checked)}
        />
      ))}
    </SettingsSection>
  );
}
