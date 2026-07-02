import { GlassEffectView } from "@legend-desktop/glass-effect-view";
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
    <View style={[styles.root, style]}>
      <View style={[styles.shadow, maxWidthStyle]}>
        <View style={[styles.frame, maxWidthStyle]}>
          <GlassEffectView glassStyle="regular" tintColor={tintColor} style={styles.glass} />
          <View style={[styles.inner, maxWidthStyle]}>
            <View style={styles.text}>
              <Text numberOfLines={1} style={styles.title}>
                {title}
              </Text>
            </View>
            {actions && actions.length > 0 ? (
              <View style={styles.actions}>
                {actions.map((action) => {
                  const isPrimary = action.variant === "primary";
                  return (
                    <Pressable
                      accessibilityRole="button"
                      disabled={action.disabled}
                      key={action.label}
                      onPress={action.onPress}
                      style={({ pressed }) => [
                        styles.button,
                        isPrimary ? styles.primaryButton : null,
                        action.minWidth ? { minWidth: action.minWidth } : null,
                        {
                          backgroundColor: isPrimary ? action.color : undefined,
                          borderColor: isPrimary && action.color ? action.color : "#ffffff66",
                          opacity: action.disabled ? 0.45 : pressed ? 0.72 : 1,
                        },
                      ]}
                    >
                      <Text style={styles.buttonText}>{action.label}</Text>
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
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  button: {
    alignItems: "center",
    borderRadius: 5,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
  },
  frame: {
    borderRadius: 8,
    minHeight: 40,
    overflow: "hidden",
  },
  glass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
  },
  inner: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 40,
    paddingHorizontal: 10,
  },
  primaryButton: {
    backgroundColor: "#ffffff24",
  },
  root: {
    alignItems: "center",
  },
  shadow: {
    alignSelf: "center",
    borderRadius: 8,
    shadowColor: "#000000",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
  },
  text: {
    maxWidth: 230,
    minWidth: 0,
  },
  title: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17,
  },
});
