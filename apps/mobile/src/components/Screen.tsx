import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../theme";
import type { ReactNode } from "react";

export default function Screen({
  children,
  scroll = true,
}: {
  children: ReactNode;
  scroll?: boolean;
}) {
  const Body = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <Body
        style={styles.flex}
        contentContainerStyle={scroll ? styles.scrollContent : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </Body>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xl },
});
