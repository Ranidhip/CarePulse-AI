import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Screen from "../components/Screen";
import { H1, H3, Body, Secondary, Caption } from "../components/Typography";
import Card from "../components/Card";
import RiskBadge from "../components/RiskBadge";
import BottomNav from "../components/BottomNav";
import BPTrendChart from "../components/BPTrendChart";
import { api } from "../api/client";
import { useRequireSession } from "../lib/useRequireSession";
import { colors, radius, spacing } from "../theme";
import type { ApiCheckIn, ApiBPReading, ApiHistory } from "../types";
import { SUPPLY_LABELS } from "../types";

type Tab = "bp" | "checkins";
type RangeFilter = "7" | "30" | "all";

const RANGE_OPTIONS: { value: RangeFilter; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "all", label: "All" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function withinRange(iso: string, range: RangeFilter): boolean {
  if (range === "all") return true;
  const days = range === "7" ? 7 : 30;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(iso).getTime() >= cutoff;
}

type Entry =
  | { kind: "bp"; id: string; occurredAt: string; reading: ApiBPReading }
  | { kind: "check_in"; id: string; occurredAt: string; checkIn: ApiCheckIn };

export default function HistoryScreen() {
  const session = useRequireSession();
  const [data, setData] = useState<ApiHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("bp");
  const [range, setRange] = useState<RangeFilter>("30");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const history = await api.getHistory();
      setData(history);
    } catch (e) {
      // Surface the failure instead of silently falling back to the
      // "no readings yet" empty state (see HomeScreen's identical
      // pattern) — otherwise a real fetch failure (expired session,
      // backend cold-start, Supabase hiccup) is indistinguishable from
      // a patient who genuinely has no history yet.
      setError(e instanceof Error ? e.message : "Failed to load your history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (session) load();
    }, [session, load])
  );

  const filteredBP = useMemo(
    () => (data?.bpReadings ?? []).filter((r) => withinRange(r.measured_at, range)),
    [data, range]
  );
  const filteredCheckIns = useMemo(
    () => (data?.checkIns ?? []).filter((c) => withinRange(c.patient_submitted_at, range)),
    [data, range]
  );

  const bpAverage = useMemo(() => {
    if (filteredBP.length === 0) return null;
    const sys = filteredBP.reduce((sum, r) => sum + r.systolic, 0) / filteredBP.length;
    const dia = filteredBP.reduce((sum, r) => sum + r.diastolic, 0) / filteredBP.length;
    return { systolic: Math.round(sys), diastolic: Math.round(dia) };
  }, [filteredBP]);

  const riskCounts = useMemo(() => {
    const counts = { low: 0, medium: 0, high: 0 };
    for (const c of filteredCheckIns) {
      if (c.risk_level) counts[c.risk_level] += 1;
    }
    return counts;
  }, [filteredCheckIns]);

  const entries: Entry[] = useMemo(() => {
    const bpEntries: Entry[] = filteredBP.map((r) => ({
      kind: "bp",
      id: `bp-${r.id}`,
      occurredAt: r.measured_at,
      reading: r,
    }));
    const checkInEntries: Entry[] = filteredCheckIns.map((c) => ({
      kind: "check_in",
      id: `checkin-${c.id}`,
      occurredAt: c.patient_submitted_at,
      checkIn: c,
    }));
    return [...bpEntries, ...checkInEntries].sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    );
  }, [filteredBP, filteredCheckIns]);

  function handleExportPDF() {
    Alert.alert("Coming soon", "PDF export isn't available yet — it's planned for a future update.");
  }

  return (
    <Screen scroll={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <H1>History</H1>

        {error && (
          <View style={styles.errorBox}>
            <Secondary style={{ color: colors.error }}>
              Couldn't load your history — {error} Pull down to retry.
            </Secondary>
          </View>
        )}

        <View style={styles.tabRow}>
          <Pressable
            onPress={() => setTab("bp")}
            style={[styles.tab, tab === "bp" && styles.tabActive]}
          >
            <Text style={[styles.tabLabel, tab === "bp" && styles.tabLabelActive]}>
              Blood pressure
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab("checkins")}
            style={[styles.tab, tab === "checkins" && styles.tabActive]}
          >
            <Text style={[styles.tabLabel, tab === "checkins" && styles.tabLabelActive]}>
              Check-ins
            </Text>
          </Pressable>
        </View>

        <View style={styles.chipRow}>
          {RANGE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => setRange(opt.value)}
              style={[styles.chip, range === opt.value && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, range === opt.value && styles.chipLabelActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === "bp" ? (
          <Card>
            {bpAverage ? (
              <>
                <Body style={{ fontWeight: "600" }}>
                  Average: {bpAverage.systolic} / {bpAverage.diastolic} mmHg
                </Body>
                <Secondary>
                  {filteredBP.length} reading{filteredBP.length === 1 ? "" : "s"}
                </Secondary>
              </>
            ) : (
              <Secondary>No blood pressure readings in this range.</Secondary>
            )}
            <BPTrendChart readings={filteredBP} />
          </Card>
        ) : (
          <Card>
            {filteredCheckIns.length > 0 ? (
              <>
                <Body style={{ fontWeight: "600" }}>
                  {filteredCheckIns.length} check-in{filteredCheckIns.length === 1 ? "" : "s"}
                </Body>
                <Secondary>
                  {riskCounts.low} low · {riskCounts.medium} medium · {riskCounts.high} high
                </Secondary>
              </>
            ) : (
              <Secondary>No check-ins in this range.</Secondary>
            )}
          </Card>
        )}

        <H3 style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>Recent entries</H3>
        {entries.length > 0 ? (
          entries.map((entry) => {
            const expanded = expandedId === entry.id;
            return (
              <Card key={entry.id}>
                <Pressable
                  style={styles.row}
                  onPress={() => setExpandedId(expanded ? null : entry.id)}
                >
                  {entry.kind === "bp" ? (
                    <View>
                      <Body style={{ fontWeight: "600" }}>
                        {entry.reading.systolic} / {entry.reading.diastolic} mmHg
                      </Body>
                      <Secondary>
                        {formatDate(entry.occurredAt)} · {formatTime(entry.occurredAt)}
                        {entry.reading.pulse != null ? ` · Pulse ${entry.reading.pulse}` : ""}
                      </Secondary>
                    </View>
                  ) : (
                    <View>
                      <Body style={{ fontWeight: "600" }}>Weekly check-in completed</Body>
                      <Secondary>
                        {formatDate(entry.occurredAt)} ·{" "}
                        {entry.checkIn.missed_dose_count ?? 0} missed doses
                      </Secondary>
                    </View>
                  )}
                  <Body style={styles.viewLink}>{expanded ? "Hide" : "View"}</Body>
                </Pressable>

                {expanded && entry.kind === "check_in" && (
                  <View style={styles.detailBox}>
                    <Secondary>
                      Missed medication: {entry.checkIn.missed_doses ? "Yes" : "No"}
                    </Secondary>
                    <Secondary>
                      Stopped medication: {entry.checkIn.medication_stopped ? "Yes" : "No"}
                    </Secondary>
                    <Secondary>
                      {/* The precise bucket the patient picked (e.g. "3-6 days")
                          isn't stored server-side — only this boolean is — so
                          only "some remaining" / "none remaining" can honestly
                          be shown here, not a specific bucket label. */}
                      Supply: {entry.checkIn.supply_remaining ? "Some remaining" : SUPPLY_LABELS.none}
                    </Secondary>
                    <Secondary>
                      Difficulty reported: {entry.checkIn.difficulty_reported ? "Yes" : "No"}
                    </Secondary>
                    {entry.checkIn.difficulty_text && (
                      <Secondary style={{ fontStyle: "italic" }}>
                        "{entry.checkIn.difficulty_text}"
                      </Secondary>
                    )}
                    {entry.checkIn.risk_level && (
                      <View style={[styles.row, { marginTop: spacing.xs }]}>
                        <Secondary>Risk level</Secondary>
                        <RiskBadge level={entry.checkIn.risk_level} />
                      </View>
                    )}
                    {entry.checkIn.provider_summary && (
                      <Secondary style={{ marginTop: spacing.xs }}>
                        {entry.checkIn.provider_summary}
                      </Secondary>
                    )}
                  </View>
                )}
                {expanded && entry.kind === "bp" && (
                  <View style={styles.detailBox}>
                    {entry.reading.pulse != null && (
                      <Secondary>Pulse: {entry.reading.pulse} bpm</Secondary>
                    )}
                    {entry.reading.notes ? (
                      <Secondary style={{ fontStyle: "italic" }}>"{entry.reading.notes}"</Secondary>
                    ) : (
                      entry.reading.pulse == null && (
                        <Secondary>No additional details recorded for this reading.</Secondary>
                      )
                    )}
                  </View>
                )}
              </Card>
            );
          })
        ) : (
          <View style={styles.emptyBox}>
            <Secondary>No readings recorded yet.</Secondary>
          </View>
        )}

        <Pressable style={styles.exportButton} onPress={handleExportPDF}>
          <Body>Export as PDF</Body>
        </Pressable>
      </ScrollView>
      <BottomNav />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  errorBox: {
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  tabRow: { flexDirection: "row", marginTop: spacing.md, marginBottom: spacing.sm, gap: spacing.xs },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius,
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabLabel: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  tabLabelActive: { color: "#FFFFFF" },
  chipRow: { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipLabel: { fontSize: 13, color: colors.textPrimary },
  chipLabelActive: { color: "#FFFFFF" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  viewLink: { textDecorationLine: "underline", color: colors.primary },
  detailBox: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, gap: 2 },
  emptyBox: {
    borderWidth: 1,
    borderColor: colors.borderDashed,
    borderStyle: "dashed",
    borderRadius: 6,
    padding: spacing.lg,
    alignItems: "center",
    marginBottom: spacing.md,
  },
  exportButton: {
    borderWidth: 1,
    borderColor: colors.borderDashed,
    borderStyle: "dashed",
    borderRadius: radius,
    padding: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
});
