import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Screen from "../components/Screen";
import { H1, H3, Body, Secondary } from "../components/Typography";
import Card from "../components/Card";
import AppButton from "../components/AppButton";
import BottomNav from "../components/BottomNav";
import { api } from "../api/client";
import { useRequireSession } from "../lib/useRequireSession";
import { colors, spacing } from "../theme";
import type { RootStackParamList } from "../navigation/RootNavigator";
import type { ApiHome } from "../types";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) +
    ", " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const session = useRequireSession();
  const [data, setData] = useState<ApiHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const home = await api.getHome();
      setData(home);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load your dashboard.");
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
        <H1>Good morning{session ? `, ${session.name.split(" ")[0]}` : ""}</H1>
        <View style={styles.statusRow}>
          <View style={styles.dot} />
          <Secondary>
            {loading ? "Syncing…" : error ? "Offline — showing last known data" : "Synced just now"}
          </Secondary>
        </View>

        <Card>
          <H3>Next medication</H3>
          {data?.nextMedication ? (
            <>
              <Body>{data.nextMedication.name}</Body>
              <Secondary>Today at {data.nextMedication.scheduled_time}</Secondary>
            </>
          ) : (
            <Secondary>No medications scheduled yet.</Secondary>
          )}
        </Card>

        <Card>
          <H3>Weekly check-in</H3>
          <Body>Due today</Body>
          <Secondary>Takes about 3 minutes</Secondary>
        </Card>

        <Card>
          <H3>Latest blood pressure</H3>
          {data?.latestBP ? (
            <>
              <Body>
                {data.latestBP.systolic} / {data.latestBP.diastolic} mmHg
              </Body>
              <Secondary>Recorded {formatDateTime(data.latestBP.measured_at)}</Secondary>
            </>
          ) : (
            <Secondary>No blood pressure recorded yet.</Secondary>
          )}
        </Card>

        <AppButton
          label="Record BP"
          variant="outlined"
          onPress={() => navigation.navigate("RecordBP")}
          style={{ marginBottom: spacing.sm }}
        />
        <AppButton
          label="Start Weekly Check-in"
          onPress={() => navigation.navigate("CheckInStep1")}
        />
      </ScrollView>
      <BottomNav />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning },
});
