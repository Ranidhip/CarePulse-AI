import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, MIN_TOUCH, radius, spacing } from "../theme";

export default function YesNoToggle({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onChange(true)}
        style={[styles.option, value === true ? styles.selected : styles.unselected]}
        accessibilityRole="button"
      >
        <Text style={value === true ? styles.selectedLabel : styles.unselectedLabel}>Yes</Text>
      </Pressable>
      <Pressable
        onPress={() => onChange(false)}
        style={[styles.option, value === false ? styles.selected : styles.unselected]}
        accessibilityRole="button"
      >
        <Text style={value === false ? styles.selectedLabel : styles.unselectedLabel}>No</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  option: {
    flex: 1,
    minHeight: MIN_TOUCH,
    borderRadius: radius,
    alignItems: "center",
    justifyContent: "center",
  },
  selected: { backgroundColor: colors.primary },
  unselected: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.secondary },
  selectedLabel: { color: "#FFFFFF", fontWeight: "600", fontSize: 16 },
  unselectedLabel: { color: colors.primary, fontWeight: "600", fontSize: 16 },
});
