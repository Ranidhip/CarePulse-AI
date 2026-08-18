import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, MIN_TOUCH, spacing } from "../theme";

export default function CheckboxRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={styles.row}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked && <Text style={styles.check}>✓</Text>}
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: MIN_TOUCH,
    paddingVertical: spacing.xs,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  check: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  label: { fontSize: 16, color: colors.textPrimary, flexShrink: 1 },
});
