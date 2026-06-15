import {
  ColorValueInput,
  RadioOption,
  SegmentedOptions,
  SwitchControl,
} from "@legend-desktop/design-system";
import { SettingsRow, SettingsSection } from "@legend-desktop/settings-window";
import type { LegendThemeBackground, LegendThemeBackgroundSource } from "@legend-desktop/theme";
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
  first?: boolean;
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
  first = false,
  issues = [],
  onThemeChange,
  selectedTheme,
  title = "Theme",
  themes,
}: ThemeSelectorSectionProps) {
  return (
    <SettingsSection card={false} contentClassName="gap-3" first={first} title={title}>
      <View accessibilityRole="radiogroup" className="gap-2">
        {themes.map((theme) => (
          <RadioOption
            key={theme.value}
            label={theme.label}
            onSelect={onThemeChange}
            selected={selectedTheme === theme.value}
            value={theme.value}
          />
        ))}
      </View>
      {issues.length > 0 ? (
        <View className="gap-1">
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
    <SettingsSection card={false} className="mt-6" contentClassName="gap-3" title="Background">
      <SettingsRow
        title="Liquid Glass"
        description="Use the native translucent glass background"
        control={
          <SwitchControl
            checked={background.glassEnabled}
            onChange={(checked) => onBackgroundChange(setGlassEnabled(background, checked))}
          />
        }
      />
      <SettingsRow
        title="Source"
        description="Choose what appears above the glass layer"
        control={
          <SegmentedOptions
            options={backgroundSourceOptions}
            value={source.type}
            onChange={(value) => onBackgroundChange(backgroundWithSource(background, value, fallbackColor))}
          />
        }
      />
      {source.type === "color" ? (
        <SettingsRow
          title="Background Color"
          description="Supports alpha, for example #101014cc"
          align="center"
          control={
            <ColorValueInput
              value={sourceColor}
              onChange={(color) => onBackgroundChange(setColorSource(background, color))}
            />
          }
        />
      ) : null}
      {source.type === "image" ? (
        <SettingsRow
          title="Background Image"
          description="Choose an image file or paste a local path"
          align="center"
          control={
            <View className="flex-row items-center gap-2">
              <TextInput
                value={imagePath}
                onChangeText={(path) => onBackgroundChange(setImageSource(background, path))}
                placeholder="/path/to/image.jpg"
                autoCapitalize="none"
                autoCorrect={false}
                className="h-9 w-72 rounded-md border border-border-primary bg-background-secondary px-2 text-sm text-text-primary"
              />
              {onChooseImage ? (
                <Pressable
                  accessibilityRole="button"
                  className="h-9 justify-center rounded-md bg-background-secondary px-3"
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
          }
        />
      ) : null}
      {source.type !== "none" ? (
        <SettingsRow
          title="Opacity"
          description="Opacity of the color or image layer"
          align="center"
          control={
            <View className="flex-row items-center gap-2">
              <TextInput
                value={normalizePercent(background.opacity)}
                onChangeText={(value) => onBackgroundChange(setBackgroundOpacity(background, value))}
                keyboardType="numeric"
                className="h-9 w-20 rounded-md border border-border-primary bg-background-secondary px-2 text-center text-sm text-text-primary"
              />
              <Text className="text-sm text-text-secondary">%</Text>
            </View>
          }
        />
      ) : null}
      <SettingsRow
        title="Tint"
        description="Add a transparent color over the background, for example #00000044"
        control={
          <SwitchControl
            checked={background.tint.enabled}
            onChange={(checked) => onBackgroundChange(setBackgroundTintEnabled(background, checked))}
          />
        }
      />
      {background.tint.enabled ? (
        <SettingsRow
          title="Tint Color"
          description="Supports alpha, for example #00000044"
          align="center"
          control={
            <ColorValueInput
              label="Tint"
              value={background.tint.color}
              onChange={(color) => onBackgroundChange(setBackgroundTintColor(background, color))}
            />
          }
        />
      ) : null}
    </SettingsSection>
  );
}

export { optionLabel };
