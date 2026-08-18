import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Screen from "../components/Screen";
import { H1, H3, Body, Secondary } from "../components/Typography";
import Card from "../components/Card";
import RiskBadge from "../components/RiskBadge";
import BottomNav from "../components/BottomNav";
import { api } from "../api/client";
import { useRequireSession } from "../lib/useRequireSession";
import { colors, spacing } from "../theme";
import type { ApiHistory } from "../types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function HistoryScreen() {
  const session = useRequireSession();
  const [data, setData] = useState<ApiHistory | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const history = await api.getHistory();
      setData(history);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (session) load();
    }, [session, load])
  );

  return (
    <Screen scroll={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <H1>History</H1>

        <H3 style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>Weekly check-ins</H3>
        {data && data.checkIns.length > 0 ? (
          data.checkIns.map((c) => (
            <Card key={c.id}>
              <View style={styles.row}>
                <Body>{formatDate(c.patient_submitted_at)}</Body>
                <RiskBadge level={c.risk_level} />
              </View>
            </Card>
          ))
        ) : (
          <View style={styles.emptyBox}>
            <Secondary>No check-ins submitted yet.</Secondary>
          </View>
        )}

        <H3 style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>Blood pressure readings</H3>
        {data && data.bpReadings.length > 0 ? (
          data.bpReadings.map((r) => (
            <Card key={r.id}>
              <View style={styles.row}>
                <Body>{formatDate(r.measured_at)}</Body>
                <Body style={{ fontWeight: "600" }}>
                  {r.systolic} / {r.diastolic} mmHg
                </Body>
              </View>
            </Card>
          ))
        ) : (
          <View style={styles.emptyBox}>
            <Secondary>No blood pressure readings recorded yet.</Secondary>
          </View>
        )}
      </ScrollView>
      <BottomNav />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  emptyBox: {
    borderWidth: 1,
    borderColor: colors.borderDashed,
    borderStyle: "dashed",
    borderRadius: 6,
    padding: spacing.lg,
    alignItems: "center",
    marginBottom: spacing.md,
  },
});
