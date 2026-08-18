import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, MIN_TOUCH, radius, spacing } from "../theme";

export default function RadioRow({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      onPress={onSelect}
      style={[styles.row, selected && styles.rowSelected]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={[styles.circle, selected && styles.circleSelected]}>
        {selected && <View style={styles.innerDot} />}
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
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    marginBottom: spacing.sm,
  },
  rowSelected: { borderColor: colors.primary },
  circle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  circleSelected: { borderColor: colors.primary },
  innerDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  label: { fontSize: 16, color: colors.textPrimary },
});
