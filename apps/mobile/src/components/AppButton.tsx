import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { colors, MIN_TOUCH, radius, spacing } from "../theme";

type Variant = "contained" | "outlined";

export default function AppButton({
  label,
  onPress,
  variant = "contained",
  disabled = false,
  loading = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: object;
}) {
  const isOutlined = variant === "outlined";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        isOutlined ? styles.outlined : styles.contained,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? (
        <ActivityIndicator color={isOutlined ? colors.primary : "#FFFFFF"} />
      ) : (
        <Text style={[styles.label, isOutlined ? styles.labelOutlined : styles.labelContained]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH,
    borderRadius: radius,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  contained: { backgroundColor: colors.primary },
  outlined: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.secondary },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  label: { fontSize: 16, fontWeight: "600" },
  labelContained: { color: "#FFFFFF" },
  labelOutlined: { color: colors.primary },
});
