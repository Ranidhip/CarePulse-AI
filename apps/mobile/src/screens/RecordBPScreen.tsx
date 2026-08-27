import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Screen from "../components/Screen";
import { H1, Body, Caption, Secondary } from "../components/Typography";
import LabeledInput from "../components/LabeledInput";
import AppButton from "../components/AppButton";
import { api } from "../api/client";
import { toDateInput, toTimeInput, parseMeasuredAt } from "../lib/dateHelpers";
import { useRequireSession } from "../lib/useRequireSession";
import { enqueueBPReading, isNetworkError } from "../lib/offlineQueue";
import { bpReadingSchema, validateOrError } from "../lib/validation";
import { colors, spacing } from "../theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

const MAX_NOTES = 300;

export default function RecordBPScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  useRequireSession();

  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [pulse, setPulse] = useState("");
  const [notes, setNotes] = useState("");
  const [dateText, setDateText] = useState(() => toDateInput(new Date()));
  const [timeText, setTimeText] = useState(() => toTimeInput(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const validation = validateOrError(bpReadingSchema, {
      systolic: systolic ? Number(systolic) : NaN,
      diastolic: diastolic ? Number(diastolic) : NaN,
      pulse: pulse ? Number(pulse) : null,
    });
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    const measuredAt = parseMeasuredAt(dateText, timeText);
    if (!measuredAt) {
      setError("Enter the measurement date as YYYY-MM-DD and time as HH:MM (24-hour).");
      return;
    }
    setError(null);
    setSaving(true);
    const payload = {
      systolic: validation.data.systolic,
      diastolic: validation.data.diastolic,
      pulse: validation.data.pulse ?? null,
      notes: notes.trim() || null,
      measured_at: measuredAt.toISOString(),
    };
    try {
      await api.saveBPReading(payload);
      navigation.navigate("Home");
    } catch (e) {
      if (isNetworkError(e)) {
        // No connection right now — keep it on-device instead of losing
        // the reading. flushQueue() (Home screen / app foreground) sends
        // it for real once the network is back.
        await enqueueBPReading(payload);
        navigation.navigate("Home");
        return;
      }
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

      <Body style={styles.question}>Measurement date and time</Body>
      <View style={styles.dateTimeRow}>
        <View style={styles.dateTimeField}>
          <LabeledInput
            label="Date"
            value={dateText}
            onChangeText={setDateText}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <View style={styles.dateTimeField}>
          <LabeledInput
            label="Time"
            value={timeText}
            onChangeText={setTimeText}
            placeholder="HH:MM"
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </View>

      <LabeledInput
        label="Notes (optional)"
        value={notes}
        onChangeText={(v) => setNotes(v.slice(0, MAX_NOTES))}
        placeholder="e.g. Measured after resting for five minutes."
        multiline
      />
      <Caption style={{ textAlign: "right", marginBottom: spacing.md }}>
        {notes.length} / {MAX_NOTES} characters
      </Caption>

      <View style={styles.validationBox}>
        <Caption style={error ? { color: colors.error } : undefined}>
          {error ?? "Validation: Enter systolic and diastolic values."}
        </Caption>
      </View>

      <Caption style={{ marginBottom: spacing.lg }}>
        ● This reading will sync when internet is available.
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
  question: { fontWeight: "600", marginBottom: spacing.sm },
  dateTimeRow: { flexDirection: "row", gap: spacing.sm },
  dateTimeField: { flex: 1 },
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
