"""
Scores the deterministic rule engine against eval/dataset.jsonl.

This is intentionally the RULE ENGINE'S evaluation, not the AI's — it
costs nothing and runs in well under a second, so it's safe to run on
every change to app/services/rules/engine.py as a regression check. See
README.md in this folder for why a full AI-pipeline evaluation run is
documented but deliberately not wired up to execute automatically (it
costs real OpenAI API credits per row).

Two report sections:

1. "structured_boundary" rows — ground truth WAS the rule engine's own
   output at dataset-generation time, so this segment should always
   score 100%. A drop here means engine.py changed behavior at a
   threshold since the dataset was generated (intentional or not) —
   re-run generate_dataset.py to refresh ground truth if the change was
   intentional, or investigate if it wasn't.

2. "narrative" rows — ground truth is a human clinical judgment call
   that often exceeds what the rule engine alone can know (it never
   reads difficulty_text). This segment is EXPECTED to score well below
   100%: the gap is the quantified case for why the AI layer exists.

Run from backend/, with the venv active:
    python eval/run_eval.py
"""

import json
import sys
from collections import Counter
from pathlib import Path

# Windows terminals often default to a non-UTF-8 codepage, which mangles
# the em-dashes used throughout this file's output — force UTF-8 so the
# report prints cleanly regardless of the console's configured codepage.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.rules.engine import RuleInput, evaluate  # noqa: E402

DATASET_PATH = Path(__file__).resolve().parent / "dataset.jsonl"
RISK_LEVELS = ["low", "medium", "high"]


def load_dataset() -> list[dict]:
    if not DATASET_PATH.exists():
        print(f"{DATASET_PATH} not found — run `python eval/generate_dataset.py` first.")
        sys.exit(1)
    rows = []
    with DATASET_PATH.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def predict(row: dict) -> tuple[str, list[str]]:
    result = evaluate(
        RuleInput(
            medication_stopped=row["medication_stopped"],
            missed_dose_count=row["missed_dose_count"],
            supply_remaining=row["supply_remaining"],
            difficulty_reported=row["difficulty_reported"],
            # .get(), not row[...]: dataset.jsonl rows generated before
            # side_effects_reported existed have no such key.
            side_effects_reported=row.get("side_effects_reported", False),
            systolic=row["systolic"],
            diastolic=row["diastolic"],
        )
    )
    return result.risk_level, result.reason_codes


def reason_code_prf(rows: list[dict], predictions: list[list[str]]) -> dict:
    """Micro-averaged precision/recall/F1 over the reason-code multi-label set."""
    tp = fp = fn = 0
    per_code: dict[str, dict[str, int]] = {}

    def bucket(code: str) -> dict[str, int]:
        return per_code.setdefault(code, {"tp": 0, "fp": 0, "fn": 0})

    for row, predicted in zip(rows, predictions):
        expected = set(row["expected_reason_codes"])
        got = set(predicted)
        for code in got & expected:
            tp += 1
            bucket(code)["tp"] += 1
        for code in got - expected:
            fp += 1
            bucket(code)["fp"] += 1
        for code in expected - got:
            fn += 1
            bucket(code)["fn"] += 1

    precision = tp / (tp + fp) if (tp + fp) else 1.0
    recall = tp / (tp + fn) if (tp + fn) else 1.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    return {"precision": precision, "recall": recall, "f1": f1, "per_code": per_code}


def print_segment_report(name: str, rows: list[dict]):
    if not rows:
        return
    predictions = [predict(row) for row in rows]
    predicted_levels = [p[0] for p in predictions]
    predicted_codes = [p[1] for p in predictions]

    correct = sum(
        1 for row, level in zip(rows, predicted_levels) if level == row["expected_risk_level"]
    )
    accuracy = correct / len(rows)

    confusion: Counter = Counter()
    for row, level in zip(rows, predicted_levels):
        confusion[(row["expected_risk_level"], level)] += 1

    prf = reason_code_prf(rows, predicted_codes)

    print(f"\n=== {name} ({len(rows)} rows) ===")
    print(f"Risk-level accuracy: {accuracy:.1%} ({correct}/{len(rows)})")
    print("Confusion matrix (rows=expected, cols=predicted):")
    header = "            " + "".join(f"{lvl:>8}" for lvl in RISK_LEVELS)
    print(header)
    for expected in RISK_LEVELS:
        line = f"{expected:>12}" + "".join(
            f"{confusion.get((expected, predicted), 0):>8}" for predicted in RISK_LEVELS
        )
        print(line)

    print(
        f"\nReason-code (multi-label) micro-avg — "
        f"precision: {prf['precision']:.1%}, recall: {prf['recall']:.1%}, F1: {prf['f1']:.1%}"
    )
    print("Per-code breakdown (tp / fp / fn):")
    for code in sorted(prf["per_code"]):
        c = prf["per_code"][code]
        print(f"  {code:<22} {c['tp']:>3} / {c['fp']:>3} / {c['fn']:>3}")

    mismatches = [
        (row["id"], row["expected_risk_level"], level, row["notes"])
        for row, level in zip(rows, predicted_levels)
        if level != row["expected_risk_level"]
    ]
    if mismatches:
        print(f"\nMismatched rows ({len(mismatches)}):")
        for row_id, expected, got, note in mismatches:
            print(f"  {row_id}: expected={expected} got={got} — {note}")


def main():
    rows = load_dataset()
    structured = [r for r in rows if r["category"] == "structured_boundary"]
    narrative = [r for r in rows if r["category"] == "narrative"]

    print(f"Loaded {len(rows)} labeled rows from {DATASET_PATH.name}")
    print_segment_report("structured_boundary (rule-engine regression check — expect ~100%)", structured)
    print_segment_report("narrative (rule-engine-ONLY score against human labels)", narrative)

    print(
        "\nNote: the narrative segment's accuracy is a FLOOR, not the system's real "
        "accuracy — it measures the rule engine alone, deliberately blind to "
        "difficulty_text. The production system also runs the 3-agent AI pipeline "
        "on top of this (see backend/app/services/agents/orchestrator.py), which is "
        "what actually reads difficulty_text and can raise the level or add reason "
        "codes like SIDE_EFFECTS / REPEATED_NONRESPONSE / OTHER that the rule engine "
        "can never produce. See README.md in this folder for how to wire up a real "
        "AI-pipeline evaluation run (not enabled here — it costs OpenAI API credits "
        "per row and needs an explicit, deliberate run)."
    )


if __name__ == "__main__":
    main()
