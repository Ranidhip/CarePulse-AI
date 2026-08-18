import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Screen from "../components/Screen";
import { H1, Body, Secondary, Caption } from "../components/Typography";
import Card from "../components/Card";
import RiskBadge from "../components/RiskBadge";
import AppButton from "../components/AppButton";
import { useRequireSession } from "../lib/useRequireSession";
import { api } from "../api/client";
import { colors, spacing } from "../theme";
import type { RootStackParamList } from "../navigation/RootNavigator";
import type { ApiCheckIn } from "../types";
import { REASON_CODE_LABELS } from "../types";

export default function CheckInSubmittedScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  useRequireSession();
  const [checkIn, setCheckIn] = useState<ApiCheckIn | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getLatestCheckIn()
      .then(setCheckIn)
      .finally(() => setLoading(false));
  }, []);

  return (
    <Screen>
      <View style={styles.centerBlock}>
        <View style={styles.checkCircle}>
          <Body style={styles.checkMark}>✓</Body>
        </View>
        <H1 style={styles.centerText}>Check-in saved</H1>
        <Secondary style={styles.centerText}>
          Your weekly check-in was recorded successfully.
        </Secondary>
      </View>

      {loading && <Secondary style={styles.centerText}>Loading result…</Secondary>}

      {checkIn && (
        <Card>
          <View style={styles.riskRow}>
            <Body style={{ fontWeight: "600" }}>Calculated risk level</Body>
            <RiskBadge level={checkIn.risk_level} />
          </View>
          {checkIn.reason_codes.length > 0 ? (
            checkIn.reason_codes.map((code) => (
              <Secondary key={code}>• {REASON_CODE_LABELS[code]}</Secondary>
            ))
          ) : (
            <Secondary>No adherence concerns detected this week.</Secondary>
          )}
        </Card>
      )}

      {checkIn && (
        <View style={styles.summaryBox}>
          <Caption style={styles.summaryLabel}>PROTOTYPE-GENERATED SUMMARY</Caption>
          <Body style={{ marginTop: spacing.xs }}>{checkIn.summary}</Body>
        </View>
      )}

      <View style={styles.disclaimerBox}>
        <Secondary>
          This is an educational prototype. It does not diagnose, prescribe, or
          replace professional medical judgement. If you have urgent symptoms,
          contact a healthcare provider directly.
        </Secondary>
      </View>

      <AppButton label="Return Home" onPress={() => navigation.navigate("Home")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerBlock: { alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.lg },
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
  riskRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  summaryBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  summaryLabel: { fontWeight: "700", letterSpacing: 0.5 },
  disclaimerBox: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
});
