import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Screen from "../components/Screen";
import { H1, H3, Body, Secondary } from "../components/Typography";
import StepProgress from "../components/StepProgress";
import Card from "../components/Card";
import CheckboxRow from "../components/CheckboxRow";
import AppButton from "../components/AppButton";
import { useRequireSession } from "../lib/useRequireSession";
import { getDraft, clearDraft } from "../lib/storage";
import { api } from "../api/client";
import { enqueueCheckIn, isNetworkError } from "../lib/offlineQueue";
import { colors, spacing } from "../theme";
import type { RootStackParamList } from "../navigation/RootNavigator";
import type { CheckInDraft } from "../types";
import { EMPTY_CHECKIN_DRAFT, SUPPLY_LABELS } from "../types";

export default function CheckInReviewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  useRequireSession();
  const [draft, setDraft] = useState<CheckInDraft>(EMPTY_CHECKIN_DRAFT);
  const [loaded, setLoaded] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDraft()
      .then((d) => {
        if (
          d.missedDoses === null ||
          d.medicationStopped === null ||
          d.supplyBucket === null ||
          d.sideEffectsReported === null
        ) {
          navigation.reset({ index: 0, routes: [{ name: "CheckInStep1" }] });
          return;
        }
        setDraft(d);
        setLoaded(true);
      })
      .catch(() => {
        // Corrupted stored draft — same recovery as the "incomplete draft"
        // branch above rather than hanging on "Loading…" forever.
        navigation.reset({ index: 0, routes: [{ name: "CheckInStep1" }] });
      });
  }, [navigation]);

  async function handleSubmit() {
    if (!confirmed || !draft.supplyBucket) return;
    setSubmitting(true);
    setError(null);
    const submittedAt = new Date().toISOString();
    // Side effects and treatment difficulty are two distinct questions in
    // the UI (this screen's own "Side Effects" and "Difficulties" cards
    // above) and now have their own distinct backend fields — previously
    // sideEffectsReported was OR'd into difficulty_reported here, so a
    // patient reporting side effects with no scheduling difficulty was
    // recorded (and shown to the provider) as SCHEDULE_DIFFICULTY, never
    // as SIDE_EFFECTS. There is still only one free-text box on this
    // draft (additionalDetails), so it's attached to whichever concept(s)
    // are actually true — both, if the patient reported both.
    const hasDifficulty = draft.difficultyReasons.length > 0;
    const hasSideEffects = draft.sideEffectsReported === true;
    const payload = {
      missed_doses: draft.missedDoses === true,
      missed_dose_count: draft.missedDoseCount,
      medication_stopped: draft.medicationStopped === true,
      supply_bucket: draft.supplyBucket,
      difficulty_reported: hasDifficulty,
      difficulty_text: hasDifficulty ? draft.additionalDetails || null : null,
      side_effects_reported: hasSideEffects,
      side_effects_text: hasSideEffects ? draft.additionalDetails || null : null,
      patient_submitted_at: submittedAt,
    };
    try {
      // Risk is calculated entirely server-side by the real Python rule
      // engine (app/services/rules/engine.py) — this app sends only the
      // raw submitted facts, never a pre-computed risk level.
      await api.submitCheckIn(payload);
      await clearDraft();
      navigation.navigate("CheckInSubmitted", {
        missedDoseCount: draft.missedDoseCount,
        supplyBucket: draft.supplyBucket,
        sideEffectsReported: draft.sideEffectsReported === true,
      });
    } catch (e) {
      if (isNetworkError(e)) {
        // No connection right now — save it locally instead of losing the
        // patient's answers. flushQueue() (triggered from Home/App on
        // reconnect) will submit it for real once the network is back.
        await enqueueCheckIn(payload);
        await clearDraft();
        navigation.navigate("CheckInSubmitted", {
          missedDoseCount: draft.missedDoseCount,
          supplyBucket: draft.supplyBucket,
          sideEffectsReported: draft.sideEffectsReported === true,
          queued: true,
          submittedAt,
        });
        return;
      }
      setError(e instanceof Error ? e.message : "Could not submit your check-in.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!loaded) return <Screen><Body>Loading…</Body></Screen>;

  return (
    <Screen>
      <StepProgress step={3} total={3} />
      <H1 style={{ marginBottom: spacing.md }}>Review your answers</H1>

      <Card>
        <View style={styles.cardHeader}>
          <H3>Medication</H3>
          <Pressable onPress={() => navigation.navigate("CheckInStep1")}>
            <Body style={styles.editLink}>Edit</Body>
          </Pressable>
        </View>
        <Secondary>
          Missed medication: {draft.missedDoses ? "Yes" : "No"}
          {draft.missedDoses ? ` · Missed doses: ${draft.missedDoseCount ?? 0}` : ""} · Stopped:{" "}
          {draft.medicationStopped ? "Yes" : "No"}
        </Secondary>
      </Card>

      <Card>
        <View style={styles.cardHeader}>
          <H3>Supply</H3>
          <Pressable onPress={() => navigation.navigate("CheckInStep1")}>
            <Body style={styles.editLink}>Edit</Body>
          </Pressable>
        </View>
        <Secondary>{draft.supplyBucket ? SUPPLY_LABELS[draft.supplyBucket] : "—"} remaining</Secondary>
      </Card>

      <Card>
        <View style={styles.cardHeader}>
          <H3>Side Effects</H3>
          <Pressable onPress={() => navigation.navigate("CheckInStep2")}>
            <Body style={styles.editLink}>Edit</Body>
          </Pressable>
        </View>
        <Secondary>
          {draft.sideEffectsReported
            ? draft.additionalDetails
              ? `Yes — "${draft.additionalDetails}"`
              : "Yes"
            : "No"}
        </Secondary>
      </Card>

      <Card>
        <View style={styles.cardHeader}>
          <H3>Difficulties</H3>
          <Pressable onPress={() => navigation.navigate("CheckInStep2")}>
            <Body style={styles.editLink}>Edit</Body>
          </Pressable>
        </View>
        <Secondary>
          {draft.difficultyReasons.length > 0 ? draft.difficultyReasons.join(" · ") : "None reported"}
        </Secondary>
      </Card>

      <CheckboxRow
        label="I confirm these answers are accurate."
        checked={confirmed}
        onToggle={() => setConfirmed((c) => !c)}
      />

      {error && (
        <Secondary style={{ color: colors.error, marginTop: spacing.sm }}>{error}</Secondary>
      )}

      <View style={styles.buttonRow}>
        <AppButton
          label="Back"
          variant="outlined"
          onPress={() => navigation.navigate("CheckInStep2")}
          style={styles.flexBtn}
        />
        <AppButton
          label="Submit Check-in"
          onPress={handleSubmit}
          disabled={!confirmed}
          loading={submitting}
          style={styles.flexBtn}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.xs },
  editLink: { textDecorationLine: "underline" },
  buttonRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  flexBtn: { flex: 1 },
});
