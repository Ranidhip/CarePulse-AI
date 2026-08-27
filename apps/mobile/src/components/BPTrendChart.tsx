import { useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Caption } from "./Typography";
import { colors, spacing } from "../theme";
import type { ApiBPReading } from "../types";

const SYSTOLIC_COLOR = colors.error; // #B3261E — same value the web dashboard's chart uses
const DIASTOLIC_COLOR = "#1A5FB4"; // matches apps/web/src/components/BPTrendChart.tsx exactly
const REFERENCE_COLOR = colors.borderDashed;

const CHART_HEIGHT = 140;
const PADDING_X = 8;
const DOT_SIZE = 7;

/**
 * Hand-rolled with plain RN Views (dots + rotated line segments) —
 * deliberately not react-native-svg or a charting library. This app's
 * policy (see BottomNav.tsx's comment on @react-navigation/bottom-tabs)
 * is to avoid native dependencies that can't be verified installing and
 * linking correctly without a real device/simulator. A BP trend is two
 * polylines over time — plain Views are enough, and it mirrors the same
 * no-new-dependency approach already used for the web dashboard's chart.
 */
export default function BPTrendChart({ readings }: { readings: ApiBPReading[] }) {
  const [width, setWidth] = useState(0);

  function handleLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  if (readings.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Caption>No blood-pressure readings in this range.</Caption>
      </View>
    );
  }

  // Oldest first, left to right.
  const sorted = [...readings].sort(
    (a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime()
  );

  const plotWidth = Math.max(width - PADDING_X * 2, 1);
  const allValues = sorted.flatMap((r) => [r.systolic, r.diastolic]);
  const minY = Math.min(40, ...allValues) - 10;
  const maxY = Math.max(180, ...allValues) + 10;

  function x(i: number): number {
    return sorted.length === 1 ? plotWidth / 2 : (i / (sorted.length - 1)) * plotWidth;
  }
  function y(value: number): number {
    return CHART_HEIGHT - ((value - minY) / (maxY - minY)) * CHART_HEIGHT;
  }

  const systolicPoints = sorted.map((r, i) => ({ x: x(i), y: y(r.systolic) }));
  const diastolicPoints = sorted.map((r, i) => ({ x: x(i), y: y(r.diastolic) }));

  return (
    <View>
      <View style={styles.legendRow}>
        <Legend color={SYSTOLIC_COLOR} label="Systolic" />
        <Legend color={DIASTOLIC_COLOR} label="Diastolic" />
        <Legend color={REFERENCE_COLOR} label="140/90 reference" />
      </View>

      <View style={styles.chart} onLayout={handleLayout}>
        {width > 0 && (
          <>
            <View style={[styles.referenceLine, { top: y(140) }]} />
            <View style={[styles.referenceLine, { top: y(90) }]} />

            {segments(systolicPoints).map((seg, i) => (
              <LineSegment key={`s-${i}`} from={seg.from} to={seg.to} color={SYSTOLIC_COLOR} />
            ))}
            {segments(diastolicPoints).map((seg, i) => (
              <LineSegment key={`d-${i}`} from={seg.from} to={seg.to} color={DIASTOLIC_COLOR} />
            ))}

            {systolicPoints.map((p, i) => (
              <Dot key={`sd-${i}`} x={p.x} y={p.y} color={SYSTOLIC_COLOR} />
            ))}
            {diastolicPoints.map((p, i) => (
              <Dot key={`dd-${i}`} x={p.x} y={p.y} color={DIASTOLIC_COLOR} />
            ))}
          </>
        )}
      </View>

      <View style={styles.axisRow}>
        <Caption>{formatShortDate(sorted[0].measured_at)}</Caption>
        <Caption>{formatShortDate(sorted[sorted.length - 1].measured_at)}</Caption>
      </View>
    </View>
  );
}

function segments(points: { x: number; y: number }[]) {
  const result: { from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    result.push({ from: points[i], to: points[i + 1] });
  }
  return result;
}

function LineSegment({
  from,
  to,
  color,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
}) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const thickness = 2;
  // Core RN's transform doesn't support transformOrigin, so `rotate`
  // always pivots around the element's own center — sizing/positioning
  // the box centered on the segment's midpoint (rather than anchored at
  // `from`, which would need transformOrigin to rotate correctly) is
  // what makes the rotated box actually line up between the two points.
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  return (
    <View
      style={{
        position: "absolute",
        left: PADDING_X + midX - length / 2,
        top: midY - thickness / 2,
        width: length,
        height: thickness,
        backgroundColor: color,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

function Dot({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <View
      style={{
        position: "absolute",
        left: PADDING_X + x - DOT_SIZE / 2,
        top: y - DOT_SIZE / 2,
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: DOT_SIZE / 2,
        backgroundColor: color,
      }}
    />
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Caption>{label}</Caption>
    </View>
  );
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

const styles = StyleSheet.create({
  legendRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.xs, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendSwatch: { width: 12, height: 12, borderRadius: 2 },
  chart: {
    height: CHART_HEIGHT,
    width: "100%",
    marginTop: spacing.xs,
  },
  referenceLine: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: colors.borderDashed,
    borderStyle: "dashed",
  },
  axisRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
  emptyBox: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderDashed,
    borderStyle: "dashed",
    borderRadius: 6,
    padding: spacing.md,
    alignItems: "center",
  },
});
