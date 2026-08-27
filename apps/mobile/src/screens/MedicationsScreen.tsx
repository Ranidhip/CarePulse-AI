import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Screen from "../components/Screen";
import { H1, H3, Body, Secondary, Caption } from "../components/Typography";
import Card from "../components/Card";
import AppButton from "../components/AppButton";
import BottomNav from "../components/BottomNav";
import { api } from "../api/client";
import { useRequireSession } from "../lib/useRequireSession";
import { colors, spacing } from "../theme";
import type { ApiMedication } from "../types";
import type { RootStackParamList } from "../navigation/RootNavigator";

export default function MedicationsScreen() {
  const session = useRequireSession();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [medications, setMedications] = useState<ApiMedication[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const meds = await api.getMedications();
      setMedications(meds);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (session) load();
    }, [session, load])
  );

  async function toggleReminder(med: ApiMedication) {
    // Optimistic — the toggle should feel instant, and updateMedication
    // already surfaces a real error if it doesn't stick (e.g. offline).
    const next = !med.reminder_enabled;
    setMedications((prev) =>
      prev.map((m) => (m.id === med.id ? { ...m, reminder_enabled: next } : m))
    );
    try {
      await api.updateMedication(med.id, { reminder_enabled: next });
    } catch {
      setMedications((prev) =>
        prev.map((m) => (m.id === med.id ? { ...m, reminder_enabled: !next } : m))
      );
    }
  }

  function editMedication(med: ApiMedication) {
    navigation.navigate("EditMedication", {
      medicationId: med.id,
      initial: {
        name: med.name,
        instructions: med.instructions,
        scheduled_time: med.scheduled_time,
        supply_status: med.supply_status,
        reminder_enabled: med.reminder_enabled,
      },
    });
  }

  return (
    <Screen scroll={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <H1>Medications</H1>
        <Secondary style={{ marginBottom: spacing.lg }}>
          Active medicines used for adherence tracking only.
        </Secondary>

        {!loading && medications.length === 0 && (
          <View style={styles.emptyBox}>
            <Secondary>No medications added yet.</Secondary>
          </View>
        )}

        {medications.map((med) => (
          <Card key={med.id}>
            <H3>{med.name}</H3>
            <Secondary>{med.instructions}</Secondary>
            <Secondary style={{ marginBottom: spacing.sm }}>
              Scheduled: {med.scheduled_time}
            </Secondary>
            <View style={[styles.row, { marginBottom: spacing.xs }]}>
              <Caption style={{ fontWeight: "700" }}>
                Reminder: {med.reminder_enabled ? "ON" : "OFF"}
              </Caption>
              <Switch
                value={med.reminder_enabled}
                onValueChange={() => toggleReminder(med)}
              />
            </View>
            <View style={styles.row}>
              <Caption style={{ fontWeight: "700" }}>Supply: {med.supply_status}</Caption>
              <Pressable onPress={() => editMedication(med)}>
                <Body style={styles.editLink}>Edit</Body>
              </Pressable>
            </View>
          </Card>
        ))}

        <AppButton
          label="Add Medication"
          onPress={() => navigation.navigate("EditMedication", {})}
          style={{ marginTop: spacing.sm }}
        />
      </ScrollView>
      <BottomNav />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  emptyBox: {
    borderWidth: 1,
    borderColor: colors.borderDashed,
    borderStyle: "dashed",
    borderRadius: 6,
    padding: spacing.lg,
    alignItems: "center",
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  editLink: { textDecorationLine: "underline" },
});
