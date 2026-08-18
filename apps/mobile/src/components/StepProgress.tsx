import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme";

export default function StepProgress({ step, total }: { step: number; total: number }) {
  return (
    <View style={styles.container}>
      <Text style={styles.overline}>
        STEP {step} OF {total}
      </Text>
      <View style={styles.row}>
        {Array.from({ length: total }).map((_, i) => {
          const idx = i + 1;
          const filled = idx <= step;
          return (
            <View key={idx} style={styles.segment}>
              <View
                style={[
                  styles.dot,
                  { borderColor: filled ? colors.textPrimary : colors.borderDashed },
                  filled && { backgroundColor: colors.textPrimary },
                ]}
              />
              {idx < total && (
                <View
                  style={[
                    styles.line,
                    { backgroundColor: idx < step ? colors.textPrimary : colors.borderDashed },
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  overline: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: "row", alignItems: "center" },
  segment: { flexDirection: "row", alignItems: "center", flex: 1 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  line: { flex: 1, height: 2, marginHorizontal: spacing.sm },
});
