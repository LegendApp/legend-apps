import {
  SettingsPage,
  SettingsRow,
  SettingsSection,
  SettingsWindow as SharedSettingsWindow,
  type SettingsWindowPage,
} from "@legend-desktop/settings-window";
import { SyntaxThemeSelectorSection } from "@legend-desktop/syntax-settings";
import { Pressable, Text, View, type GestureResponderEvent } from "react-native";
import { diffSettingsWindowIdentifier } from "./appConstants";
import {
  diffFontFamilyOptions,
  diffFontSizeOptions,
  setDiffFontFamilySetting,
  setDiffFontSizeSetting,
  setDiffSyntaxThemeSetting,
  useDiffFontFamilySetting,
  useDiffFontSizeSetting,
  useDiffSyntaxTheme,
  useDiffSyntaxThemeSetting,
  type DiffFontFamilySetting,
} from "./diffSettings";

type DiffSettingsPage = "appearance";

type FontSizeControlProps = {
  onChange: (fontSize: number) => void;
  value: number;
};

type FontFamilyControlProps = {
  onChange: (fontFamily: DiffFontFamilySetting) => void;
  value: DiffFontFamilySetting;
};

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getContextMenuLocation(event: GestureResponderEvent) {
  const { locationX, locationY, pageX, pageY } = event.nativeEvent;

  if (finiteNumber(pageX) && finiteNumber(pageY)) {
    return Promise.resolve({ x: pageX, y: pageY });
  }

  return new Promise<{ x: number; y: number }>((resolve) => {
    event.currentTarget.measure((_x, _y, width, height, measuredPageX, measuredPageY) => {
      const localX = finiteNumber(locationX) ? locationX : Math.max(0, width - 1);
      const localY = finiteNumber(locationY) ? locationY : Math.max(0, height - 1);
      const originX = finiteNumber(measuredPageX) ? measuredPageX : 0;
      const originY = finiteNumber(measuredPageY) ? measuredPageY : 0;

      resolve({
        x: originX + localX,
        y: originY + localY,
      });
    });
  });
}

function FontFamilyControl({ onChange, value }: FontFamilyControlProps) {
  const selectedOption = diffFontFamilyOptions.find((option) => option.value === value) ?? diffFontFamilyOptions[0];

  const handlePress = async (event: GestureResponderEvent) => {
    const location = await getContextMenuLocation(event);
    const { showContextMenu } = await import("@legend-desktop/context-menu");
    const selected = await showContextMenu(
      diffFontFamilyOptions.map((option) => ({
        id: option.value,
        title: option.value === value ? `* ${option.label}` : option.label,
      })),
      location,
    );

    if (diffFontFamilyOptions.some((option) => option.value === selected)) {
      onChange(selected as DiffFontFamilySetting);
    }
  };

  return (
    <Pressable
      accessibilityLabel="Diff font"
      accessibilityRole="button"
      className="h-9 min-w-56 flex-row items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 hover:bg-surface-muted active:bg-surface-muted"
      onPress={handlePress}
    >
      <Text className="min-w-0 flex-1 text-foreground" numberOfLines={1}>
        {selectedOption.label}
      </Text>
      <Text className="text-text-secondary" selectable={false}>
        v
      </Text>
    </Pressable>
  );
}

function FontSizeControl({ onChange, value }: FontSizeControlProps) {
  return (
    <View className="flex-row overflow-hidden rounded-md border border-border bg-surface">
      {diffFontSizeOptions.map((fontSize) => {
        const selected = fontSize === value;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className={`h-8 justify-center px-3 ${selected ? "bg-surface-muted" : "hover:bg-surface-muted"}`}
            key={fontSize}
            onPress={() => onChange(fontSize)}
          >
            <Text className="text-foreground text-sm">
              {fontSize}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AppearanceSettingsPage() {
  const fontFamily = useDiffFontFamilySetting();
  const fontSize = useDiffFontSizeSetting();
  const selectedSyntaxTheme = useDiffSyntaxThemeSetting();

  return (
    <SettingsPage>
      <SettingsSection
        first
        title="Text"
      >
        <SettingsRow
          align="center"
          control={(
            <FontFamilyControl
              onChange={setDiffFontFamilySetting}
              value={fontFamily}
            />
          )}
          title="Font"
        />
        <SettingsRow
          align="center"
          control={(
            <FontSizeControl
              onChange={setDiffFontSizeSetting}
              value={fontSize}
            />
          )}
          title="Font size"
        />
      </SettingsSection>
      <SyntaxThemeSelectorSection
        onThemeChange={setDiffSyntaxThemeSetting}
        selectedTheme={selectedSyntaxTheme}
      />
    </SettingsPage>
  );
}

const pages: SettingsWindowPage<DiffSettingsPage>[] = [
  {
    id: "appearance",
    render: () => <AppearanceSettingsPage />,
    title: "Appearance",
  },
];

export function SettingsWindow() {
  const syntaxTheme = useDiffSyntaxTheme();

  return (
    <SharedSettingsWindow
      appearance={syntaxTheme.appearance}
      pages={pages}
      windowIdentifier={diffSettingsWindowIdentifier}
    />
  );
}

export default SettingsWindow;
