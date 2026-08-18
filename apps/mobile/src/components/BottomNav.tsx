/**
 * NAVIGATION LIBRARY NOTE (per requirements: "reuse an existing
 * navigation library if installed; if none exists for this pattern, use
 * the simplest reliable structure and document the limitation"):
 *
 * apps/mobile has @react-navigation/native + native-stack installed,
 * which this app uses for all screen-to-screen transitions (RootNavigator).
 * @react-navigation/bottom-tabs is NOT installed, and adding a new
 * dependency wasn't verifiable in the build sandbox (no network access
 * there to test the install). Rather than add an unverified dependency
 * under a deadline, this is a plain custom tab bar: five buttons that
 * call navigation.navigate() into the same native-stack. Visually and
 * functionally it behaves like a tab bar; it just isn't
 * @react-navigation/bottom-tabs under the hood. Swapping to a real tab
 * navigator later is a small, isolated change confined to this file and
 * RootNavigator.tsx.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation, useNavigationState } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, MIN_TOUCH, spacing } from "../theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

const ITEMS: { label: string; route: keyof RootStackParamList; glyph: string }[] = [
  { label: "Home", route: "Home", glyph: "●" },
  { label: "Medications", route: "Medications", glyph: "▣" },
  { label: "BP", route: "RecordBP", glyph: "♥" },
  { label: "History", route: "History", glyph: "◷" },
  { label: "Profile", route: "Profile", glyph: "◐" },
];

export default function BottomNav() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const currentRoute = useNavigationState((state) => state?.routes[state.index]?.name);

  return (
    <View style={styles.bar}>
      {ITEMS.map(({ label, route, glyph }) => {
        const active = currentRoute === route;
        return (
          <Pressable
            key={route}
            onPress={() => navigation.navigate(route as never)}
            style={styles.item}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <Text style={[styles.glyph, active && styles.activeText]}>{glyph}</Text>
            <Text style={[styles.label, active && styles.activeText]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  item: {
    flex: 1,
    minHeight: MIN_TOUCH + 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xs,
    gap: 2,
  },
  glyph: { fontSize: 16, color: colors.textSecondary },
  label: { fontSize: 11, color: colors.textSecondary },
  activeText: { color: colors.textPrimary, fontWeight: "700" },
});
