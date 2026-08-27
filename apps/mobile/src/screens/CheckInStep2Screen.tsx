import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Screen from "../components/Screen";
import { H1, Body, Caption } from "../components/Typography";
import StepProgress from "../components/StepProgress";
import YesNoToggle from "../components/YesNoToggle";
import CheckboxRow from "../components/CheckboxRow";
import LabeledInput from "../components/LabeledInput";
import AppButton from "../components/AppButton";
import { useRequireSession } from "../lib/useRequireSession";
import { getDraft, setDraft } from "../lib/storage";
import { spacing } from "../theme";
import type { RootStackParamList } from "../navigation/RootNavigator";
import type { CheckInDraft } from "../types";
import { DIFFICULTY_OPTIONS, EMPTY_CHECKIN_DRAFT } from "../types";

const MAX_DETAILS = 300;

export default function CheckInStep2Screen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  useRequireSession();
  const [draft, setDraftState] = useState<CheckInDraft>(EMPTY_CHECKIN_DRAFT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getDraft()
      .then((d) => {
        if (d.missedDoses === null || d.medicationStopped === null || d.supplyBucket === null) {
          navigation.reset({ index: 0, routes: [{ name: "CheckInStep1" }] });
          return;
        }
        setDraftState(d);
        setLoaded(true);
      })
      .catch(() => {
        // Corrupted stored draft — same recovery as the "incomplete draft"
        // branch above rather than hanging on "Loading…" forever.
        navigation.reset({ index: 0, routes: [{ name: "CheckInStep1" }] });
      });
  }, [navigation]);

  function update(patch: Partial<CheckInDraft>) {
    const next = { ...draft, ...patch };
    setDraftState(next);
    setDraft(next);
  }

  function toggleReason(reason: string) {
    const has = draft.difficultyReasons.includes(reason);
    update({
      difficultyReasons: has
        ? draft.difficultyReasons.filter((r) => r !== reason)
        : [...draft.difficultyReasons, reason],
    });
  }

  const canProceed = draft.sideEffectsReported !== null;

  if (!loaded) return <Screen><Body>Loading…</Body></Screen>;

  return (
    <Screen>
      <StepProgress step={2} total={3} />
      <H1 style={{ marginBottom: spacing.md }}>Side effects and difficulties</H1>

      <Body style={styles.question}>Did you experience any side effects?</Body>
      <YesNoToggle
        value={draft.sideEffectsReported}
        onChange={(v) => update({ sideEffectsReported: v })}
      />

      <Body style={styles.question}>What made treatment difficult?</Body>
      <View style={{ marginBottom: spacing.md }}>
        {DIFFICULTY_OPTIONS.map((opt) => (
          <CheckboxRow
            key={opt}
            label={opt}
            checked={draft.difficultyReasons.includes(opt)}
            onToggle={() => toggleReason(opt)}
          />
        ))}
      </View>

      <LabeledInput
        label="Additional details (optional)"
        value={draft.additionalDetails}
        onChangeText={(v) => update({ additionalDetails: v.slice(0, MAX_DETAILS) })}
        placeholder="I sometimes forget my evening tablet when travelling."
        multiline
      />
      <Caption style={{ textAlign: "right", marginBottom: spacing.md }}>
        {draft.additionalDetails.length} / {MAX_DETAILS} characters
      </Caption>

      <View style={styles.buttonRow}>
        <AppButton
          label="Back"
          variant="outlined"
          onPress={() => navigation.navigate("CheckInStep1")}
          style={styles.flexBtn}
        />
        <AppButton
          label="Next"
          onPress={() => navigation.navigate("CheckInReview")}
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
