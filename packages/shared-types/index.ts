/**
 * Canonical reference copy of the enums/shapes shared across
 * backend/app/models/*.py, apps/web/src/types/index.ts, and
 * apps/mobile/src/types.ts.
 *
 * NOT currently imported by either app — see README.md in this folder
 * for why (no npm workspace wiring exists yet) and what actually fixing
 * that would take. Until then, this file is a deliberately-kept
 * source-of-truth: when the backend's Pydantic Literals change, update
 * this file first, then grep both apps' own copies against it. That's
 * what would have caught the reason-code drift bug this project actually
 * hit once (see git history: web's ReasonCode list silently dropped 3 of
 * 8 real values because there was nothing to diff it against).
 */

// Matches backend/supabase/migrations' `reason_code` enum exactly.
export type ReasonCode =
  | "MISSED_DOSES"
  | "MEDICATION_STOPPED"
  | "LOW_SUPPLY"
  | "SIDE_EFFECTS"
  | "SCHEDULE_DIFFICULTY"
  | "ABNORMAL_BP"
  | "REPEATED_NONRESPONSE"
  | "OTHER";

// Matches supabase/migrations' `risk_level` enum exactly. "pending" is a
// frontend-only bucket (see backend/app/api/provider.py::_compute_tier) —
// it's never a value the database itself stores.
export type RiskLevel = "low" | "medium" | "high";
export type RiskTier = RiskLevel | "pending";

// Matches backend/app/models/provider.py's FollowUpOutcome exactly.
export type FollowUpOutcome =
  | "contacted"
  | "unreachable"
  | "referred_to_doctor"
  | "medication_supply_issue_reported"
  | "other";

// Matches backend/app/models/provider.py's AlertStatus exactly (the raw
// DB/API value — apps/web's UI-facing AlertStatus ("New"/"In Progress"/
// "Follow-up Recorded"/"Resolved") is a separate, derived display label,
// not this one).
export type AlertStatus = "open" | "acknowledged" | "resolved";

// Matches backend/app/models/provider.py's RiskAssessmentFeedback exactly.
export type RiskAssessmentFeedback = "helpful" | "not_helpful" | "reported";

// Matches supabase/migrations' `supply_status` enum exactly.
export type SupplyStatus = "adequate" | "low" | "out";
