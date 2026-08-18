/**
 * Deterministic risk-rule engine — the safety floor.
 *
 * This is a line-for-line TypeScript port of
 * backend/app/services/rules/engine.py, kept in sync deliberately: same
 * thresholds, same reason codes, same rule_version. It is NOT a
 * reimplementation of new logic — see openspec/changes/
 * carepulse-working-prototype/proposal.md for why the frontend runs a
 * mirrored copy instead of calling the live backend for this prototype.
 *
 * These are UNVALIDATED prototype thresholds pending clinical sign-off.
 * This engine never diagnoses; it only classifies structured fields into
 * an adherence-risk level with transparent reasons.
 */

import type { CheckInInput, ReasonCode, RiskLevel } from "../types";

export const RULE_VERSION = "v1-prototype-unvalidated";

const HIGH_SYSTOLIC_THRESHOLD = 180;
const HIGH_DIASTOLIC_THRESHOLD = 120;
const MEDIUM_MISSED_DOSE_COUNT_THRESHOLD = 2;

export interface RuleResult {
  riskLevel: RiskLevel;
  reasonCodes: ReasonCode[];
  ruleVersion: string;
}

export function evaluateRisk(input: CheckInInput): RuleResult {
  const reasonCodes: ReasonCode[] = [];
  const addReason = (code: ReasonCode) => {
    if (!reasonCodes.includes(code)) reasonCodes.push(code);
  };

  // --- High risk ---
  let isHigh = false;

  if (input.medicationStopped) {
    isHigh = true;
    addReason("MEDICATION_STOPPED");
  }

  const bpAbnormal =
    (input.systolic !== null && input.systolic >= HIGH_SYSTOLIC_THRESHOLD) ||
    (input.diastolic !== null && input.diastolic >= HIGH_DIASTOLIC_THRESHOLD);
  if (bpAbnormal) {
    isHigh = true;
    addReason("ABNORMAL_BP");
  }

  if (isHigh) {
    return { riskLevel: "high", reasonCodes, ruleVersion: RULE_VERSION };
  }

  // --- Medium risk ---
  let isMedium = false;

  if (
    input.missedDoseCount !== null &&
    input.missedDoseCount >= MEDIUM_MISSED_DOSE_COUNT_THRESHOLD
  ) {
    isMedium = true;
    addReason("MISSED_DOSES");
  }

  // supplyRemainingDays here plays the role of backend's boolean
  // `supply_remaining`: <= 3 days counts as running out.
  if (input.supplyRemainingDays !== null && input.supplyRemainingDays <= 3) {
    isMedium = true;
    addReason("LOW_SUPPLY");
  }

  if (input.difficultyReported) {
    isMedium = true;
    addReason("SCHEDULE_DIFFICULTY");
  }

  if (isMedium) {
    return { riskLevel: "medium", reasonCodes, ruleVersion: RULE_VERSION };
  }

  // --- Low risk ---
  return { riskLevel: "low", reasonCodes: [], ruleVersion: RULE_VERSION };
}

/**
 * Deterministic, clearly-labelled fallback clinical summary.
 * Describes only submitted facts — never diagnoses, prescribes, or
 * recommends dosage changes. Matches the "Prototype-generated summary"
 * requirement in openspec specs/provider-dashboard/spec.md.
 */
export function generateFallbackSummary(input: CheckInInput): string {
  const parts: string[] = [];

  if (input.medicationStopped) {
    parts.push("Patient reported stopping their medication.");
  } else if (input.missedDoseCount && input.missedDoseCount > 0) {
    parts.push(
      `Patient reported ${input.missedDoseCount} missed dose${
        input.missedDoseCount === 1 ? "" : "s"
      } this week.`
    );
  } else {
    parts.push("Patient reported no missed doses this week.");
  }

  if (input.supplyRemainingDays !== null) {
    parts.push(`Medicine supply remaining: ${input.supplyRemainingDays} day(s).`);
  }

  if (input.systolic !== null && input.diastolic !== null) {
    parts.push(`Latest recorded BP was ${input.systolic}/${input.diastolic}.`);
  }

  if (input.difficultyReported && input.difficultyText) {
    parts.push(`Patient noted: "${input.difficultyText}"`);
  } else if (input.difficultyReported) {
    parts.push("Patient reported difficulty following their treatment schedule.");
  }

  parts.push("Provider review may be required based on the above.");

  return parts.join(" ");
}
