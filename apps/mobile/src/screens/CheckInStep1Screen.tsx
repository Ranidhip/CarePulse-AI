import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Screen from "../components/Screen";
import { H1, Body } from "../components/Typography";
import StepProgress from "../components/StepProgress";
import YesNoToggle from "../components/YesNoToggle";
import RadioRow from "../components/RadioRow";
import LabeledInput from "../components/LabeledInput";
import AppButton from "../components/AppButton";
import { useRequireSession } from "../lib/useRequireSession";
import { getDraft, setDraft } from "../lib/storage";
import { spacing } from "../theme";
import type { RootStackParamList } from "../navigation/RootNavigator";
import type { CheckInDraft, SupplyBucket } from "../types";
import { EMPTY_CHECKIN_DRAFT, SUPPLY_LABELS } from "../types";

const SUPPLY_OPTIONS: SupplyBucket[] = ["7+", "3-6", "0-2", "none"];

export default function CheckInStep1Screen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  useRequireSession();
  const [draft, setDraftState] = useState<CheckInDraft>(EMPTY_CHECKIN_DRAFT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getDraft().then((d) => {
      setDraftState(d);
      setLoaded(true);
    });
  }, []);

  function update(patch: Partial<CheckInDraft>) {
    const next = { ...draft, ...patch };
    setDraftState(next);
    setDraft(next);
  }

  const canProceed =
    draft.missedDoses !== null && draft.medicationStopped !== null && draft.supplyBucket !== null;

  if (!loaded) return <Screen><Body>Loading…</Body></Screen>;

  return (
    <Screen>
      <StepProgress step={1} total={3} />
      <H1 style={{ marginBottom: spacing.md }}>Medication and supply</H1>

      <Body style={styles.question}>Did you miss any medication this week?</Body>
      <YesNoToggle
        value={draft.missedDoses}
        onChange={(v) =>
          update({ missedDoses: v, missedDoseCount: v ? (draft.missedDoseCount ?? 0) : null })
        }
      />

      {draft.missedDoses && (
        <LabeledInput
          label="Number of missed doses"
          value={draft.missedDoseCount != null ? String(draft.missedDoseCount) : ""}
          onChangeText={(v) => update({ missedDoseCount: Number(v) || 0 })}
          keyboardType="number-pad"
        />
      )}

      <Body style={styles.question}>Did you stop taking any medication?</Body>
      <YesNoToggle
        value={draft.medicationStopped}
        onChange={(v) => update({ medicationStopped: v })}
      />

      <Body style={styles.question}>Remaining medicine supply</Body>
      <View style={{ marginBottom: spacing.md }}>
        {SUPPLY_OPTIONS.map((opt) => (
          <RadioRow
            key={opt}
            label={SUPPLY_LABELS[opt]}
            selected={draft.supplyBucket === opt}
            onSelect={() => update({ supplyBucket: opt })}
          />
        ))}
      </View>

      <View style={styles.buttonRow}>
        <AppButton label="Back" variant="outlined" onPress={() => navigation.navigate("Home")} style={styles.flexBtn} />
        <AppButton
          label="Save and Exit"
          variant="outlined"
          onPress={() => navigation.navigate("Home")}
          style={styles.flexBtn}
        />
        <AppButton
          label="Next"
          onPress={() => navigation.navigate("CheckInStep2")}
          disabled={!canProceed}
          style={styles.flexBtn}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  question: { fontWeight: "600", marginBottom: spacing.sm },
  buttonRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  flexBtn: { flex: 1 },
});
