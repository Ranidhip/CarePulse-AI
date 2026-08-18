import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Screen from "../components/Screen";
import { H1, Caption, Secondary } from "../components/Typography";
import LabeledInput from "../components/LabeledInput";
import AppButton from "../components/AppButton";
import { api } from "../api/client";
import { useRequireSession } from "../lib/useRequireSession";
import { colors, spacing } from "../theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

export default function RecordBPScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  useRequireSession();

  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [pulse, setPulse] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const sys = Number(systolic);
    const dia = Number(diastolic);
    if (!systolic || !diastolic || Number.isNaN(sys) || Number.isNaN(dia)) {
      setError("Enter systolic and diastolic values.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.saveBPReading({
        systolic: sys,
        diastolic: dia,
        pulse: pulse ? Number(pulse) : null,
        measured_at: new Date().toISOString(),
        notes: notes || null,
      });
      navigation.navigate("Home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this reading.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <H1>Record Blood Pressure</H1>
      <Secondary style={{ marginBottom: spacing.lg }}>
        Enter the values shown on your BP monitor.
      </Secondary>

      <LabeledInput
        label="Systolic (mmHg)"
        value={systolic}
        onChangeText={setSystolic}
        keyboardType="number-pad"
      />
      <LabeledInput
        label="Diastolic (mmHg)"
        value={diastolic}
        onChangeText={setDiastolic}
        keyboardType="number-pad"
      />
      <LabeledInput
        label="Pulse (optional)"
        value={pulse}
        onChangeText={setPulse}
        keyboardType="number-pad"
      />
      <LabeledInput
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="Measured after resting for five minutes."
        multiline
      />

      <View style={styles.validationBox}>
        <Caption style={error ? { color: colors.error } : undefined}>
          {error ?? "Validation: Enter systolic and diastolic values."}
        </Caption>
      </View>

      <Caption style={{ marginBottom: spacing.lg }}>
        ● This reading is saved to your provider's dashboard immediately.
      </Caption>

      <AppButton
        label="Save Reading"
        onPress={handleSave}
        loading={saving}
        style={{ marginBottom: spacing.sm }}
      />
      <AppButton label="Cancel" variant="outlined" onPress={() => navigation.navigate("Home")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  validationBox: {
    borderWidth: 1,
    borderColor: colors.borderDashed,
    borderStyle: "dashed",
    borderRadius: 6,
    padding: spacing.sm,
    marginBottom: spacing.md,
    minHeight: 40,
  },
});
