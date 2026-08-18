import { StyleSheet, Text, View } from "react-native";
import type { RiskLevel } from "../types";
import { riskColors } from "../theme";

export default function RiskBadge({ level }: { level: RiskLevel }) {
  const c = riskColors[level];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.fg }]}>
      <Text style={[styles.label, { color: c.fg }]}>{c.label} risk</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  label: { fontSize: 13, fontWeight: "700" },
});
