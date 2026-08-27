import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Screen from "../components/Screen";
import { H1, H3, Body, Secondary, Caption } from "../components/Typography";
import Card from "../components/Card";
import RiskBadge from "../components/RiskBadge";
import AppButton from "../components/AppButton";
import { useRequireSession } from "../lib/useRequireSession";
import { api } from "../api/client";
import { colors, riskColors, spacing } from "../theme";
import type { RootStackParamList } from "../navigation/RootNavigator";
import type { ApiCheckIn } from "../types";
import { SUPPLY_LABELS } from "../types";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) +
    ", " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * A display-only reference code, computed client-side from data the app
 * already has — there is no backend column or generator for this (see
 * the conversation that requested this screen match the design mockup).
 * Not used to look anything up; purely a human-friendly label the
 * patient can quote if they contact their clinic.
 */
function computeReference(checkInId: string, servedAtIso: string): string {
  const d = new Date(servedAtIso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const suffix = checkInId.replace(/-/g, "").slice(-3).toUpperCase();
  return `CP-${y}${m}${day}-${suffix}`;
}

/**
 * "Next check-in due" — the backend has no scheduling/cadence concept at
 * all, so this is a client-side assumption matching the screen's own
 * "Weekly check-in" naming: exactly 7 days after this one was received.
 */
function computeNextDue(servedAtIso: string): string {
  const d = new Date(servedAtIso);
  d.setDate(d.getDate() + 7);
  return formatDate(d.toISOString());
}

type SubmittedRoute = RouteProp<RootStackParamList, "CheckInSubmitted">;

export default function CheckInSubmittedScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<SubmittedRoute>();
  useRequireSession();
  const params = route.params;
  const [checkIn, setCheckIn] = useState<ApiCheckIn | null>(null);
  const [loading, setLoading] = useState(!params?.queued);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    // A queued (offline) submission has no server-assigned check-in to
    // fetch yet — it hasn't reached the backend at all. Skip the network
    // call entirely and render the "queued offline" state from params
    // instead (see the checkIn-gated blocks below, which simply don't
    // render while checkIn stays null).
    if (params?.queued) return;
    api
      .getLatestCheckIn()
      .then(setCheckIn)
      .catch(() => {
        // The submission itself already succeeded (this screen only
        // renders after that) — a transient failure fetching the result
        // back shouldn't look identical to nothing happening.
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, [params?.queued]);

  const needsAttention = checkIn?.risk_level === "medium" || checkIn?.risk_level === "high";

  return (
    <Screen>
      <View style={styles.centerBlock}>
        <View style={styles.checkCircle}>
          <Body style={styles.checkMark}>✓</Body>
        </View>
        <H1 style={styles.centerText}>Check-in submitted</H1>
        {checkIn && (
          <Secondary style={styles.centerText}>
            Your answers were saved on {formatDateTime(checkIn.server_received_at)}. Your care
            team will review them.
          </Secondary>
        )}
        {params?.queued && (
          <Secondary style={styles.centerText}>
            Your answers are saved on this device
            {params.submittedAt ? ` (${formatDateTime(params.submittedAt)})` : ""}. They'll be
            sent to your care team automatically once you're back online.
          </Secondary>
        )}
      </View>

      {loading && <Secondary style={styles.centerText}>Loading result…</Secondary>}
      {loadError && (
        <Secondary style={styles.centerText}>
          Your check-in was submitted, but we couldn't load its result just now. Check History
          in a moment.
        </Secondary>
      )}

      {checkIn && !loading && (
        <View style={styles.statusRow}>
          <View style={styles.dot} />
          <Secondary>Synced</Secondary>
        </View>
      )}
      {params?.queued && (
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: colors.warning }]} />
          <Secondary>Queued offline — will sync when internet is available</Secondary>
        </View>
      )}

      {params && (
        <Card>
          <H3>Summary</H3>
          <Secondary>
            Missed doses: {params.missedDoseCount ?? 0} · Supply:{" "}
            {SUPPLY_LABELS[params.supplyBucket]} · Side effects:{" "}
            {params.sideEffectsReported ? "Yes" : "No"}
          </Secondary>
        </Card>
      )}

      {checkIn && (
        <Card>
          <View style={styles.referenceRow}>
            <Secondary>Reference</Secondary>
            <Body style={{ fontWeight: "600" }}>
              {computeReference(checkIn.id, checkIn.server_received_at)}
            </Body>
          </View>
        </Card>
      )}

      {checkIn && (
        <Card>
          <H3>What happens next</H3>
          <Secondary>1. Care team reviews within 48 hours.</Secondary>
          <Secondary>2. You are contacted if follow-up is needed.</Secondary>
          <Secondary>3. Next check-in due {computeNextDue(checkIn.server_received_at)}.</Secondary>
        </Card>
      )}

      {checkIn && checkIn.risk_level && (
        <Card>
          <View style={styles.riskRow}>
            <Body style={{ fontWeight: "600" }}>Calculated risk level</Body>
            <RiskBadge level={checkIn.risk_level} />
          </View>
        </Card>
      )}

      {checkIn && needsAttention && checkIn.provider_summary && (
        <View
          style={[
            styles.alertBox,
            { borderColor: riskColors[checkIn.risk_level as "medium" | "high"].fg },
          ]}
        >
          <Caption
            style={{
              fontWeight: "700",
              color: riskColors[checkIn.risk_level as "medium" | "high"].fg,
              marginBottom: spacing.xs,
            }}
          >
            YOUR ANSWERS SUGGEST THIS NEEDS ATTENTION
          </Caption>
          <Body>{checkIn.provider_summary}</Body>
        </View>
      )}

      <View style={styles.disclaimerBox}>
        <Secondary>
          This is an educational prototype. It does not diagnose, prescribe, or
          replace professional medical judgement. If you have urgent symptoms,
          contact a healthcare provider directly.
        </Secondary>
      </View>

      <AppButton
        label="Back to Home"
        onPress={() => navigation.navigate("Home")}
        style={{ marginBottom: spacing.sm }}
      />
      <AppButton
        label="View Check-in History"
        variant="outlined"
        onPress={() => navigation.navigate("History")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerBlock: { alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.md },
  centerText: { textAlign: "center" },
  checkCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  checkMark: { fontSize: 28, color: colors.success },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  referenceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  riskRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  alertBox: {
    borderWidth: 1,
    borderRadius: 6,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  disclaimerBox: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
});
