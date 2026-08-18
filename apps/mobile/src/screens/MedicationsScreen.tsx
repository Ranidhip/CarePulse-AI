import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Screen from "../components/Screen";
import { H1, H3, Body, Secondary, Caption } from "../components/Typography";
import Card from "../components/Card";
import AppButton from "../components/AppButton";
import BottomNav from "../components/BottomNav";
import { api } from "../api/client";
import { useRequireSession } from "../lib/useRequireSession";
import { colors, spacing } from "../theme";
import type { ApiMedication } from "../types";
import { Pressable } from "react-native";

export default function MedicationsScreen() {
  const session = useRequireSession();
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

  function notImplemented() {
    Alert.alert("Not part of this demo", "Editing medications isn't part of this prototype's demo workflow.");
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
            <View style={styles.row}>
              <View style={styles.reminderRow}>
                <Caption style={{ fontWeight: "700", marginRight: spacing.xs }}>
                  Reminder: {med.reminder_on ? "ON" : "OFF"}
                </Caption>
                <Switch value={!!med.reminder_on} disabled />
              </View>
              <Pressable onPress={notImplemented}>
                <Body style={styles.editLink}>Edit</Body>
              </Pressable>
            </View>
          </Card>
        ))}

        <AppButton label="Add Medication" onPress={notImplemented} style={{ marginTop: spacing.sm }} />
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
  reminderRow: { flexDirection: "row", alignItems: "center" },
  editLink: { textDecorationLine: "underline" },
});
