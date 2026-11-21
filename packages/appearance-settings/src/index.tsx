import { ColorValueInput } from "@legend-apps/design-system";
import { SettingsRow, SettingsSection, SettingsSelectRow, SettingsSwitchRow, SettingsSegmentedRow } from "@legendapp/spark/ui/settings";
import type { LegendThemeBackground, LegendThemeBackgroundSource } from "@legend-apps/theme";
import { Text, TextInput, Pressable, View } from "react-native";

export type AppearanceThemeOption = {
  label: string;
  value: string;
};

export type AppearanceThemeIssue = {
  filename: string;
  message: string;
};

export type ThemeSelectorSectionProps = {
  issues?: AppearanceThemeIssue[];
  onThemeChange: (theme: string) => void;
  selectedTheme: string;
  title?: string;
  themes: AppearanceThemeOption[];
};

export type BackgroundSettingsSectionProps = {
  background: LegendThemeBackground;
  fallbackColor: string;
  onBackgroundChange: (background: LegendThemeBackground) => void;
  onChooseImage?: () => Promise<string | null | undefined> | string | null | undefined;
};

const backgroundSourceOptions: { label: string; value: LegendThemeBackgroundSource["type"] }[] = [
  { label: "None", value: "none" },
  { label: "Color", value: "color" },
  { label: "Image", value: "image" },
];

function normalizePercent(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}`;
}

function parsePercent(value: string) {
  const numeric = Number.parseFloat(value);
  if (Number.isNaN(numeric)) {
    return 1;
  }
  return Math.max(0, Math.min(1, numeric / 100));
}

function optionLabel(options: readonly { label: string; value: string }[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function backgroundWithSource(
  background: LegendThemeBackground,
  type: LegendThemeBackgroundSource["type"],
  fallbackColor: string,
): LegendThemeBackground {
  const currentSource = background.source;
  if (type === "color") {
    return {
      ...background,
      source: {
        color: currentSource.type === "color" ? currentSource.color : fallbackColor,
        type: "color",
      },
    };
  }

  if (type === "image") {
    return {
      ...background,
      source: {
        imagePath: currentSource.type === "image" ? currentSource.imagePath : "",
        type: "image",
      },
    };
  }

  return {
    ...background,
    source: {
      type: "none",
    },
  };
}

function setColorSource(background: LegendThemeBackground, color: string): LegendThemeBackground {
  return {
    ...background,
    source: {
      color: color.trim(),
      type: "color",
    },
  };
}

function setImageSource(background: LegendThemeBackground, imagePath: string): LegendThemeBackground {
  return {
    ...background,
    source: {
      imagePath: imagePath.trim(),
      type: "image",
    },
  };
}

function setBackgroundOpacity(background: LegendThemeBackground, value: string): LegendThemeBackground {
  return {
    ...background,
    opacity: parsePercent(value),
  };
}

function setBackgroundTintEnabled(background: LegendThemeBackground, enabled: boolean): LegendThemeBackground {
  return {
    ...background,
    tint: {
      ...background.tint,
      enabled,
    },
  };
}

function setBackgroundTintColor(background: LegendThemeBackground, color: string): LegendThemeBackground {
  return {
    ...background,
    tint: {
      ...background.tint,
      color: color.trim(),
    },
  };
}

function setGlassEnabled(background: LegendThemeBackground, glassEnabled: boolean): LegendThemeBackground {
  return {
    ...background,
    glassEnabled,
  };
}

export function ThemeSelectorSection({
  issues = [],
  onThemeChange,
  selectedTheme,
  title = "Theme",
  themes,
}: ThemeSelectorSectionProps) {
  const selectedThemeValue = themes.some((theme) => theme.value === selectedTheme)
    ? selectedTheme
    : themes[0]?.value ?? selectedTheme;

  return (
    <SettingsSection>
      <SettingsSelectRow
        label={title}
        options={themes}
        value={selectedThemeValue}
        onValueChange={onThemeChange}
      />
      {issues.length > 0 ? (
        <View className="gap-1 px-4 pb-3.5">
          {issues.map((issue) => (
            <Text className="text-sm text-text-secondary" key={`${issue.filename}-${issue.message}`}>
              {issue.filename}: {issue.message}
            </Text>
          ))}
        </View>
      ) : null}
    </SettingsSection>
  );
}

export function BackgroundSettingsSection({
  background,
  fallbackColor,
  onBackgroundChange,
  onChooseImage,
}: BackgroundSettingsSectionProps) {
  const source = background.source;
  const sourceColor = source.type === "color" ? source.color : fallbackColor;
  const imagePath = source.type === "image" ? source.imagePath : "";

  return (
    <SettingsSection title="Background">
      <SettingsSwitchRow
        label="Liquid Glass"
        description="Use the native translucent glass background"
        value={background.glassEnabled}
        onValueChange={(checked) => onBackgroundChange(setGlassEnabled(background, checked))}
      />
      <SettingsSegmentedRow
        label="Source"
        description="Choose what appears above the glass layer"
        options={backgroundSourceOptions}
        value={source.type}
        onValueChange={(value) => onBackgroundChange(backgroundWithSource(background, value as LegendThemeBackgroundSource["type"], fallbackColor))}
      />
      {source.type === "color" ? (
        <SettingsRow
          label="Background Color"
          description="Supports alpha, for example #101014cc">
          <ColorValueInput
            value={sourceColor}
            onChange={(color) => onBackgroundChange(setColorSource(background, color))}
          />
        </SettingsRow>
      ) : null}
      {source.type === "image" ? (
        <SettingsRow
          label="Background Image"
          description="Choose an image file or paste a local path">
          <View className="flex-row items-center gap-2">
            <TextInput
              value={imagePath}
              onChangeText={(path) => onBackgroundChange(setImageSource(background, path))}
              placeholder="/path/to/image.jpg"
              autoCapitalize="none"
              autoCorrect={false}
              className="h-8 w-72 rounded-md border border-border-primary bg-background-primary px-2 text-sm text-text-primary"
            />
            {onChooseImage ? (
              <Pressable
                accessibilityRole="button"
                className="h-8 justify-center rounded-md border border-border-primary bg-background-primary px-3 hover:bg-background-secondary/70"
                onPress={async () => {
                  const nextImagePath = await onChooseImage();
                  if (nextImagePath) {
                    onBackgroundChange(setImageSource(background, nextImagePath));
                  }
                }}
              >
                <Text className="text-sm text-text-primary">Choose</Text>
              </Pressable>
            ) : null}
          </View>
        </SettingsRow>
      ) : null}
      {source.type !== "none" ? (
        <SettingsRow
          label="Opacity"
          description="Opacity of the color or image layer">
          <View className="flex-row items-center gap-2">
            <TextInput
              value={normalizePercent(background.opacity)}
              onChangeText={(value) => onBackgroundChange(setBackgroundOpacity(background, value))}
              keyboardType="numeric"
              className="h-8 w-20 rounded-md border border-border-primary bg-background-primary px-2 text-center text-sm text-text-primary"
            />
            <Text className="text-sm text-text-secondary">%</Text>
          </View>
        </SettingsRow>
      ) : null}
      <SettingsSwitchRow
        label="Tint"
        description="Add a transparent color over the background, for example #00000044"
        value={background.tint.enabled}
        onValueChange={(checked) => onBackgroundChange(setBackgroundTintEnabled(background, checked))}
      />
      {background.tint.enabled ? (
        <SettingsRow
          label="Tint Color"
          description="Supports alpha, for example #00000044">
          <ColorValueInput
            label="Tint"
            value={background.tint.color}
            onChange={(color) => onBackgroundChange(setBackgroundTintColor(background, color))}
          />
        </SettingsRow>
      ) : null}
    </SettingsSection>
  );
}

export { optionLabel };
