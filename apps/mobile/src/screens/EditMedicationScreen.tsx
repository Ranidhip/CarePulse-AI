import { useEffect, useState } from "react";
import { Alert, StyleSheet, Switch, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Screen from "../components/Screen";
import { H1, Body, Caption, Secondary } from "../components/Typography";
import LabeledInput from "../components/LabeledInput";
import RadioRow from "../components/RadioRow";
import AppButton from "../components/AppButton";
import { api } from "../api/client";
import { useRequireSession } from "../lib/useRequireSession";
import { medicationSchema, validateOrError } from "../lib/validation";
import { colors, spacing } from "../theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

type SupplyStatus = "adequate" | "low" | "out";

const SUPPLY_STATUS_OPTIONS: { value: SupplyStatus; label: string }[] = [
  { value: "adequate", label: "Adequate supply" },
  { value: "low", label: "Running low" },
  { value: "out", label: "Out of medicine" },
];

export default function EditMedicationScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  useRequireSession();

  // undefined medicationId = adding a new medication; a string id = editing
  // an existing one. Both share this one screen/form.
  const params = route.params as
    | {
        medicationId?: string;
        initial?: {
          name: string;
          instructions: string;
          scheduled_time: string | null;
          supply_status: string;
          reminder_enabled: boolean;
        };
      }
    | undefined;
  const medicationId = params?.medicationId;
  const isEditing = medicationId != null;

  const [name, setName] = useState(params?.initial?.name ?? "");
  const [instructions, setInstructions] = useState(params?.initial?.instructions ?? "");
  const [scheduledTime, setScheduledTime] = useState(params?.initial?.scheduled_time ?? "");
  const [supplyStatus, setSupplyStatus] = useState<SupplyStatus>(
    (params?.initial?.supply_status as SupplyStatus) ?? "adequate"
  );
  const [reminderEnabled, setReminderEnabled] = useState(params?.initial?.reminder_enabled ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  async function handleSave() {
    const validation = validateOrError(medicationSchema, {
      medication_name: name,
      dosage_description: instructions,
      scheduled_time: scheduledTime,
      supply_status: supplyStatus,
      reminder_enabled: reminderEnabled,
    });
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        medication_name: validation.data.medication_name,
        dosage_description: validation.data.dosage_description || undefined,
        scheduled_time: validation.data.scheduled_time || undefined,
        supply_status: validation.data.supply_status,
        reminder_enabled: validation.data.reminder_enabled,
      };
      if (isEditing && medicationId) {
        await api.updateMedication(medicationId, payload);
      } else {
        await api.createMedication(payload);
      }
      navigation.navigate("Medications");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this medication.");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!medicationId) return;
    Alert.alert("Remove medication", "Remove this medication from your list?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            await api.deleteMedication(medicationId);
            navigation.navigate("Medications");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not remove this medication.");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  return (
    <Screen>
      <H1>{isEditing ? "Edit Medication" : "Add Medication"}</H1>
      <Secondary style={{ marginBottom: spacing.lg }}>
        This is what you're taking, for your own adherence tracking — not a prescription record.
      </Secondary>

      <LabeledInput label="Medicine name" value={name} onChangeText={setName} placeholder="e.g. Amlodipine 5mg" />
      <LabeledInput
        label="Instructions"
        value={instructions}
        onChangeText={setInstructions}
        placeholder="e.g. One tablet every morning with food"
      />
      <LabeledInput
        label="Scheduled time (optional)"
        value={scheduledTime}
        onChangeText={setScheduledTime}
        placeholder="e.g. 8:00 AM"
      />

      <Body style={styles.question}>Current supply</Body>
      <View style={{ marginBottom: spacing.md }}>
        {SUPPLY_STATUS_OPTIONS.map((opt) => (
          <RadioRow
            key={opt.value}
            label={opt.label}
            selected={supplyStatus === opt.value}
            onSelect={() => setSupplyStatus(opt.value)}
          />
        ))}
      </View>

      <View style={styles.reminderRow}>
        <Body style={styles.question}>Reminder: {reminderEnabled ? "ON" : "OFF"}</Body>
        <Switch value={reminderEnabled} onValueChange={setReminderEnabled} />
      </View>

      <View style={styles.validationBox}>
        <Caption style={error ? { color: colors.error } : undefined}>
          {error ?? "Medicine name is required."}
        </Caption>
      </View>

      <AppButton label="Save" onPress={handleSave} loading={saving} style={{ marginBottom: spacing.sm }} />
      {isEditing && (
        <AppButton
          label="Remove Medication"
          variant="outlined"
          onPress={handleDelete}
          style={{ marginBottom: spacing.sm }}
        />
      )}
      <AppButton label="Cancel" variant="outlined" onPress={() => navigation.navigate("Medications")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  question: { fontWeight: "600", marginBottom: spacing.sm },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
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
