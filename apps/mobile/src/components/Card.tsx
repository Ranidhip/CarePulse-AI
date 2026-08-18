import { StyleSheet, View, type ViewProps } from "react-native";
import { colors, radius, spacing } from "../theme";

export default function Card(props: ViewProps) {
  return <View {...props} style={[styles.card, props.style]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
});
