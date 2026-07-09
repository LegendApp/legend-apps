import { GlassEffectView } from "@legend-apps/glass-effect-view";
import { Pressable, StyleSheet, Text, View, type ColorValue, type StyleProp, type ViewStyle } from "react-native";

export type GlassToastAction = {
  color?: string;
  disabled?: boolean;
  label: string;
  minWidth?: number;
  onPress: () => void;
  variant?: "default" | "primary";
};

export type GlassToastProps = {
  actions?: readonly GlassToastAction[];
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
  tintColor?: ColorValue;
  title: string;
};

export function GlassToast({ actions, maxWidth = 420, style, tintColor = "#00000022", title }: GlassToastProps) {
  const maxWidthStyle = { maxWidth };
  return (
    <View className="items-center" style={style}>
      <View style={[styles.shadow, maxWidthStyle]}>
        <View className="min-h-10 overflow-hidden rounded-lg" style={maxWidthStyle}>
          <GlassEffectView glassStyle="regular" tintColor={tintColor} style={styles.glass} />
          <View className="min-h-10 flex-row items-center gap-3 px-3" style={maxWidthStyle}>
            <View className="min-w-0 max-w-56">
              <Text className="text-sm font-bold leading-5 text-white" numberOfLines={1}>
                {title}
              </Text>
            </View>
            {actions && actions.length > 0 ? (
              <View className="flex-row gap-2">
                {actions.map((action) => {
                  const isPrimary = action.variant === "primary";
                  return (
                    <Pressable
                      accessibilityRole="button"
                      className="h-7 items-center justify-center rounded border px-3"
                      disabled={action.disabled}
                      key={action.label}
                      onPress={action.onPress}
                      style={({ pressed }) => [
                        isPrimary ? styles.primaryButton : null,
                        action.minWidth ? { minWidth: action.minWidth } : null,
                        {
                          backgroundColor: isPrimary ? action.color : undefined,
                          borderColor: isPrimary && action.color ? action.color : "#ffffff66",
                          opacity: action.disabled ? 0.45 : pressed ? 0.72 : 1,
                        },
                      ]}
                    >
                      <Text className="text-xs font-bold leading-4 text-white">{action.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  glass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
  },
  primaryButton: {
    backgroundColor: "#ffffff24",
  },
  shadow: {
    alignSelf: "center",
    borderRadius: 8,
    shadowColor: "#000000",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
  },
});
