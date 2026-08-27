"""
Generates the labeled synthetic evaluation dataset (eval/dataset.jsonl) —
the Week 3 "evaluation dataset + metrics" deliverable that had no code at
all before this script.

Two kinds of rows, both fictional/synthetic (no real patient data):

1. "structured_boundary" — systematically sweeps the deterministic rule
   engine's own thresholds (missed-dose count, BP cutoffs, supply,
   difficulty). Ground truth for these is computed by calling the real
   rule engine (app/services/rules/engine.py) at generation time, so this
   half of the dataset is really a frozen regression/coverage fixture: if
   a future change to engine.py silently changes behavior at a boundary,
   run_eval.py's rule-engine pass will catch the drift.

2. "narrative" — hand-written realistic patient free-text scenarios
   covering all 8 reason codes, including the 3 the rule engine can never
   produce on its own (SIDE_EFFECTS, REPEATED_NONRESPONSE, OTHER) since
   those only come from the AI reading difficulty_text. Ground truth here
   is a human clinical judgment call (what a reasonable reviewer would
   label), not something derivable from the rule engine — this half is
   what an AI-pipeline evaluation run (see eval/README.md) would actually
   score against.

Run from backend/, with the venv active:
    python eval/generate_dataset.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.rules.engine import RuleInput, evaluate  # noqa: E402

OUT_PATH = Path(__file__).resolve().parent / "dataset.jsonl"


def _structured_row(
    idx: int,
    *,
    medication_stopped: bool,
    missed_dose_count: int | None,
    supply_remaining: bool,
    difficulty_reported: bool,
    systolic: int | None,
    diastolic: int | None,
    note: str,
) -> dict:
    result = evaluate(
        RuleInput(
            medication_stopped=medication_stopped,
            missed_dose_count=missed_dose_count,
            supply_remaining=supply_remaining,
            difficulty_reported=difficulty_reported,
            systolic=systolic,
            diastolic=diastolic,
        )
    )
    return {
        "id": f"struct-{idx:03d}",
        "category": "structured_boundary",
        "medication_stopped": medication_stopped,
        "missed_dose_count": missed_dose_count,
        "supply_remaining": supply_remaining,
        "difficulty_reported": difficulty_reported,
        "difficulty_text": None,
        "systolic": systolic,
        "diastolic": diastolic,
        "expected_risk_level": result.risk_level,
        "expected_reason_codes": result.reason_codes,
        "notes": note,
    }


def generate_structured_rows() -> list[dict]:
    rows: list[dict] = []
    idx = 1

    # --- Missed-dose-count boundary sweep (threshold = 2) ---
    for count in (0, 1, 2, 3, 5):
        rows.append(
            _structured_row(
                idx,
                medication_stopped=False,
                missed_dose_count=count,
                supply_remaining=True,
                difficulty_reported=False,
                systolic=None,
                diastolic=None,
                note=f"Missed-dose-count boundary sweep: count={count}",
            )
        )
        idx += 1

    # --- Systolic BP boundary sweep (threshold = 180) ---
    for sys_val in (150, 179, 180, 181, 200):
        rows.append(
            _structured_row(
                idx,
                medication_stopped=False,
                missed_dose_count=0,
                supply_remaining=True,
                difficulty_reported=False,
                systolic=sys_val,
                diastolic=70,
                note=f"Systolic BP boundary sweep: systolic={sys_val}",
            )
        )
        idx += 1

    # --- Diastolic BP boundary sweep (threshold = 120) ---
    for dia_val in (100, 119, 120, 121, 130):
        rows.append(
            _structured_row(
                idx,
                medication_stopped=False,
                missed_dose_count=0,
                supply_remaining=True,
                difficulty_reported=False,
                systolic=110,
                diastolic=dia_val,
                note=f"Diastolic BP boundary sweep: diastolic={dia_val}",
            )
        )
        idx += 1

    # --- Single-factor medium triggers ---
    rows.append(
        _structured_row(
            idx,
            medication_stopped=False,
            missed_dose_count=0,
            supply_remaining=False,
            difficulty_reported=False,
            systolic=None,
            diastolic=None,
            note="Supply depleted alone triggers medium",
        )
    )
    idx += 1
    rows.append(
        _structured_row(
            idx,
            medication_stopped=False,
            missed_dose_count=0,
            supply_remaining=True,
            difficulty_reported=True,
            systolic=None,
            diastolic=None,
            note="Difficulty reported alone triggers medium",
        )
    )
    idx += 1

    # --- medication_stopped alone triggers high ---
    rows.append(
        _structured_row(
            idx,
            medication_stopped=True,
            missed_dose_count=0,
            supply_remaining=True,
            difficulty_reported=False,
            systolic=None,
            diastolic=None,
            note="Medication stopped alone triggers high",
        )
    )
    idx += 1

    # --- Clean low-risk baseline ---
    rows.append(
        _structured_row(
            idx,
            medication_stopped=False,
            missed_dose_count=0,
            supply_remaining=True,
            difficulty_reported=False,
            systolic=120,
            diastolic=80,
            note="Fully adherent baseline — expect low, no reason codes",
        )
    )
    idx += 1

    # --- Multi-factor combinations (medium + medium stacking, and
    #     high always wins regardless of medium factors present) ---
    combos = [
        (False, 3, False, True, None, None, "Missed doses + low supply + difficulty, no BP"),
        (True, 3, False, True, 190, 125, "Everything triggered at once — still just 'high', reasons list all applicable codes"),
        (False, 1, True, False, 185, 70, "Below missed-dose threshold but high systolic — high via BP alone"),
        (False, 2, True, False, 110, 70, "Exactly at missed-dose threshold, otherwise clean — medium"),
        (True, 0, True, False, 110, 70, "Medication stopped overrides an otherwise fully-clean check-in"),
    ]
    for (ms, mdc, sr, dr, sys_val, dia_val, note) in combos:
        rows.append(
            _structured_row(
                idx,
                medication_stopped=ms,
                missed_dose_count=mdc,
                supply_remaining=sr,
                difficulty_reported=dr,
                systolic=sys_val,
                diastolic=dia_val,
                note=note,
            )
        )
        idx += 1

    # --- None-handling: missed_dose_count and BP fields can be unset ---
    none_cases = [
        (False, None, True, False, None, None, "All optional fields unset — clean low baseline"),
        (False, None, False, False, None, None, "Missed-dose count unknown but supply depleted — medium via supply"),
        (False, None, True, True, None, None, "Missed-dose count unknown, difficulty reported — medium via difficulty"),
        (True, None, True, False, None, None, "Missed-dose count unknown, medication stopped — high regardless"),
        (False, 3, True, False, None, None, "Missed doses over threshold, BP not recorded this week"),
        (False, 0, True, False, 180, None, "Systolic exactly at threshold, diastolic unset"),
        (False, 0, True, False, None, 120, "Diastolic exactly at threshold, systolic unset"),
    ]
    for (ms, mdc, sr, dr, sys_val, dia_val, note) in none_cases:
        rows.append(
            _structured_row(
                idx,
                medication_stopped=ms,
                missed_dose_count=mdc,
                supply_remaining=sr,
                difficulty_reported=dr,
                systolic=sys_val,
                diastolic=dia_val,
                note=note,
            )
        )
        idx += 1

    # --- Additional single- and two-factor sweeps for broader coverage ---
    extra = [
        (False, 2, False, False, None, None, "Missed doses at threshold + low supply, no difficulty"),
        (False, 2, True, True, None, None, "Missed doses at threshold + difficulty, supply fine"),
        (False, 0, False, True, None, None, "Low supply + difficulty, no missed doses recorded"),
        (False, 1, False, False, None, None, "One missed dose (below threshold) + low supply"),
        (False, 1, True, True, None, None, "One missed dose (below threshold) + difficulty"),
        (False, 0, True, False, 179, 119, "Both BP values just under threshold — still low"),
        (False, 0, True, False, 180, 120, "Both BP values exactly at threshold — high"),
        (True, 5, False, True, 190, 125, "Worst case: every single factor triggered"),
        (False, 0, True, False, 160, 100, "Elevated but below both high thresholds — still low from rule engine alone"),
        (False, 2, True, False, 170, 110, "Missed doses at threshold + elevated-but-not-high BP — medium, not high"),
    ]
    for (ms, mdc, sr, dr, sys_val, dia_val, note) in extra:
        rows.append(
            _structured_row(
                idx,
                medication_stopped=ms,
                missed_dose_count=mdc,
                supply_remaining=sr,
                difficulty_reported=dr,
                systolic=sys_val,
                diastolic=dia_val,
                note=note,
            )
        )
        idx += 1

    # --- Full factorial sweep over the 4 boolean-ish factors, at a fixed
    #     normal BP, for two missed-dose counts (below and at threshold) —
    #     systematic coverage of every medium-trigger combination. ---
    for missed_dose_count in (1, 2):
        for medication_stopped in (False, True):
            for supply_remaining in (True, False):
                for difficulty_reported in (True, False):
                    rows.append(
                        _structured_row(
                            idx,
                            medication_stopped=medication_stopped,
                            missed_dose_count=missed_dose_count,
                            supply_remaining=supply_remaining,
                            difficulty_reported=difficulty_reported,
                            systolic=120,
                            diastolic=80,
                            note=(
                                f"Factorial sweep: missed_dose_count={missed_dose_count}, "
                                f"medication_stopped={medication_stopped}, "
                                f"supply_remaining={supply_remaining}, "
                                f"difficulty_reported={difficulty_reported}"
                            ),
                        )
                    )
                    idx += 1

    return rows


# --- Narrative scenarios ----------------------------------------------
#
# Hand-labeled: (medication_stopped, missed_dose_count, supply_remaining,
# difficulty_reported, systolic, diastolic, difficulty_text,
# expected_risk_level, expected_reason_codes, notes)
NARRATIVE_SCENARIOS: list[tuple] = [
    (
        False, 0, True, True, 118, 76,
        "I get dizzy and lightheaded about an hour after my morning tablet, "
        "so some days I skip it because I'm scared of fainting.",
        "medium", ["SIDE_EFFECTS", "SCHEDULE_DIFFICULTY"],
        "Side effects driving irregular adherence, BP still normal",
    ),
    (
        True, 0, True, True, 122, 80,
        "I stopped taking the tablets last week because they were making my "
        "ankles swell up badly.",
        "high", ["MEDICATION_STOPPED", "SIDE_EFFECTS"],
        "Stopped due to side effect — rule engine alone catches MEDICATION_STOPPED, AI should add SIDE_EFFECTS",
    ),
    (
        False, 1, True, False, 128, 82,
        "Nothing unusual this week, just forgot one dose on Tuesday when I was traveling.",
        "low", [],
        "Single missed dose, no other concerns — should stay low",
    ),
    (
        False, 4, True, True, 130, 84,
        "I keep forgetting because my daily routine changed since I started a new job — "
        "the medicine used to be tied to my old breakfast time.",
        "medium", ["MISSED_DOSES", "SCHEDULE_DIFFICULTY"],
        "Routine disruption causing missed doses",
    ),
    (
        False, 0, False, False, 125, 78,
        "I'm down to my last two tablets and haven't been able to get to the pharmacy this week.",
        "medium", ["LOW_SUPPLY"],
        "Pure access/supply issue",
    ),
    (
        False, 0, True, False, 188, 96,
        "Felt fine this week, just recorded my blood pressure as usual.",
        "high", ["ABNORMAL_BP"],
        "High systolic alone, no other adherence concern",
    ),
    (
        False, 0, True, False, 132, 128,
        "No issues to report.",
        "high", ["ABNORMAL_BP"],
        "High diastolic alone",
    ),
    (
        False, 3, True, True, 140, 88,
        "This is the third week in a row I've missed doses — I know I should call the clinic "
        "but I keep putting it off.",
        "high", ["MISSED_DOSES", "REPEATED_NONRESPONSE"],
        "Repeated non-response pattern across weeks, patient self-aware but not acting",
    ),
    (
        False, 0, True, True, 121, 79,
        "I'm not sure which tablet is for blood pressure and which is for my cholesterol — "
        "I think I might be taking them at the wrong times.",
        "medium", ["SCHEDULE_DIFFICULTY", "OTHER"],
        "Medication confusion, not a clean fit for any single existing code",
    ),
    (
        False, 0, True, False, 124, 80,
        "Everything is going well, I feel great and my energy is back to normal.",
        "low", [],
        "Clean positive check-in",
    ),
    (
        True, 0, True, True, 118, 74,
        "My daughter told me the tablets aren't natural and I should try herbal remedies instead, "
        "so I've stopped for now.",
        "high", ["MEDICATION_STOPPED", "OTHER"],
        "Stopped due to belief/misinformation, not side effects — distinct root cause worth flagging as OTHER alongside MEDICATION_STOPPED",
    ),
    (
        False, 2, True, True, 145, 90,
        "I've been having trouble affording the co-pay this month so I've been stretching out my doses.",
        "medium", ["MISSED_DOSES", "LOW_SUPPLY", "SCHEDULE_DIFFICULTY"],
        "Cost-driven dose-stretching — presents as multiple overlapping structured signals",
    ),
    (
        False, 0, True, True, 119, 77,
        "I get a dry cough that won't go away since starting this medicine, it's affecting my sleep.",
        "medium", ["SIDE_EFFECTS"],
        "Side effect reported, adherence itself not yet affected",
    ),
    (
        False, 5, False, True, 150, 92,
        "I ran out of medicine two weeks ago and haven't been able to refill — missed most doses since.",
        "high", ["MISSED_DOSES", "LOW_SUPPLY", "SCHEDULE_DIFFICULTY"],
        "Supply lapse cascading into missed doses over weeks",
    ),
    (
        False, 0, True, False, 126, 81,
        "Quick question for my provider about my next check-up date, otherwise all good.",
        "low", ["OTHER"],
        "Administrative question, not a clinical concern — OTHER, still low risk",
    ),
    (
        False, 1, True, True, 155, 95,
        "The new dose upset my stomach the first two days but I'm managing now.",
        "medium", ["SIDE_EFFECTS", "ABNORMAL_BP"],
        "Mild resolving side effect plus elevated (not high-threshold) BP",
    ),
    (
        False, 0, True, True, 121, 79,
        "I called the clinic twice this month about my medication schedule and haven't heard back yet.",
        "medium", ["REPEATED_NONRESPONSE", "SCHEDULE_DIFFICULTY"],
        "Patient reaching out but not receiving follow-up — flags provider-side gap too",
    ),
    (
        True, 2, True, True, 182, 118,
        "Stopped the tablets because of severe headaches, and I've also been missing the ones I do have.",
        "high", ["MEDICATION_STOPPED", "SIDE_EFFECTS", "MISSED_DOSES", "ABNORMAL_BP"],
        "Compound high-risk case: stopped + side effects + missed doses + high BP all present",
    ),
    (
        False, 0, True, False, 129, 83,
        "Started walking every morning, feeling much better overall.",
        "low", [],
        "Positive lifestyle note, no concerns",
    ),
    (
        False, 0, True, True, 123, 80,
        "Not sure if I should take the tablet before or after food, been guessing all week.",
        "medium", ["SCHEDULE_DIFFICULTY"],
        "Instruction confusion without missed doses",
    ),
    (
        False, 0, True, False, 133, 85,
        "Went for my regular walk and did my check-in as usual, nothing new to report.",
        "low", [],
        "Routine uneventful check-in",
    ),
    (
        True, 1, True, True, 176, 108,
        "I stopped one of my two tablets because I read online it interacts badly with my diabetes medicine.",
        "high", ["MEDICATION_STOPPED", "OTHER"],
        "Stopped due to a perceived drug-interaction concern — legitimate clinical question, flagged OTHER alongside MEDICATION_STOPPED",
    ),
    (
        False, 0, True, True, 127, 81,
        "My grandson usually reminds me to take my tablets but he's away at university now, so I keep forgetting.",
        "medium", ["SCHEDULE_DIFFICULTY"],
        "Loss of a reminder support system",
    ),
    (
        False, 3, True, False, 148, 91,
        "Missed a few doses this week, been really busy with a family emergency.",
        "medium", ["MISSED_DOSES"],
        "Situational missed doses, clear one-off cause",
    ),
    (
        False, 0, False, False, 131, 84,
        "Pharmacy said my refill isn't ready until next week, so I'm rationing what's left.",
        "medium", ["LOW_SUPPLY"],
        "Pharmacy-side refill delay, patient proactive about it",
    ),
    (
        False, 0, True, True, 124, 79,
        "The tablets make me feel drowsy in the afternoon, so I've been skipping the midday dose on workdays.",
        "medium", ["SIDE_EFFECTS", "MISSED_DOSES"],
        "Side effect causing selective dose-skipping",
    ),
    (
        False, 6, False, True, 165, 102,
        "I haven't been able to take much of anything this week — ran out of pills and things have been chaotic at home.",
        "high", ["MISSED_DOSES", "LOW_SUPPLY", "SCHEDULE_DIFFICULTY"],
        "Severe multi-week adherence breakdown, still under BP high threshold",
    ),
    (
        False, 0, True, False, 120, 78,
        "All good this week, just double-checking my next appointment is still on the 30th.",
        "low", ["OTHER"],
        "Administrative/scheduling question only",
    ),
    (
        False, 0, True, True, 118, 75,
        "I get a metallic taste after taking the tablet, it's unpleasant but I've kept taking it anyway.",
        "medium", ["SIDE_EFFECTS"],
        "Tolerated side effect, adherence unaffected — still worth flagging",
    ),
    (
        False, 4, True, True, 152, 94,
        "I keep meaning to set a reminder on my phone but haven't gotten around to it — missed doses most days.",
        "medium", ["MISSED_DOSES", "SCHEDULE_DIFFICULTY"],
        "Lack of reminder system, self-acknowledged",
    ),
    (
        True, 0, True, True, 168, 106,
        "Stopped taking it because I felt fine and figured I didn't need it anymore.",
        "high", ["MEDICATION_STOPPED", "OTHER"],
        "Stopped due to a misunderstanding of chronic treatment, not side effects — flag as OTHER too",
    ),
    (
        False, 0, True, True, 122, 80,
        "I messaged the clinic through the app three times this week about my dizziness and haven't gotten a reply.",
        "medium", ["REPEATED_NONRESPONSE", "SIDE_EFFECTS"],
        "Unanswered outreach about a real side effect",
    ),
    (
        False, 2, True, False, 191, 128,
        "Missed a couple doses and my blood pressure reading looked high this week.",
        "high", ["MISSED_DOSES", "ABNORMAL_BP"],
        "Missed doses coinciding with a high BP reading",
    ),
    (
        False, 0, True, False, 129, 82,
        "Feeling good, sticking to the schedule exactly as prescribed.",
        "low", [],
        "Model positive-adherence example",
    ),
    (
        False, 1, True, True, 138, 87,
        "Not sure if the new generic brand is the same strength as before — looks like a different pill.",
        "medium", ["SCHEDULE_DIFFICULTY", "OTHER"],
        "Generic-substitution confusion, a real and common pharmacy issue",
    ),
    (
        False, 0, False, True, 144, 90,
        "Out of medicine and also confused about the new dosage my doctor mentioned at the last visit.",
        "medium", ["LOW_SUPPLY", "SCHEDULE_DIFFICULTY"],
        "Combined supply and instruction confusion",
    ),
    (
        False, 0, True, True, 126, 81,
        "Skin feels itchy since the dose increase last month, wondering if it's related.",
        "medium", ["SIDE_EFFECTS"],
        "Possible delayed side effect, patient uncertain of cause",
    ),
    (
        False, 5, False, True, 183, 121,
        "Been really unwell this week, missed most doses, ran out of medicine, and my BP monitor showed a high reading too.",
        "high", ["MISSED_DOSES", "LOW_SUPPLY", "SCHEDULE_DIFFICULTY", "ABNORMAL_BP"],
        "Compound crisis week — everything at once, no medication_stopped though",
    ),
    (
        False, 0, True, False, 115, 73,
        "Went on holiday and kept up with the medicine the whole time, no problems.",
        "low", [],
        "Adherence maintained despite travel",
    ),
    (
        False, 0, True, True, 130, 84,
        "I asked my pharmacist about a cheaper alternative but I'm still taking the same tablets as before.",
        "low", ["OTHER"],
        "Cost inquiry without any actual adherence impact yet",
    ),
    (
        False, 2, True, True, 149, 93,
        "This is the second week I've called about my missed doses and nobody has called me back yet.",
        "medium", ["MISSED_DOSES", "REPEATED_NONRESPONSE"],
        "Patient repeatedly reaching out, still no provider response",
    ),
    (
        True, 4, False, True, 172, 104,
        "Stopped taking it after running out, and also missed several doses before that because of the side effects.",
        "high", ["MEDICATION_STOPPED", "MISSED_DOSES", "LOW_SUPPLY", "SIDE_EFFECTS"],
        "Cascading failure: side effects led to missed doses led to running out led to stopping",
    ),
    (
        False, 0, True, False, 134, 86,
        "Everything as normal, no new symptoms or concerns this week.",
        "low", [],
        "Another clean baseline for class balance",
    ),
]


def generate_narrative_rows() -> list[dict]:
    rows: list[dict] = []
    for i, (
        ms, mdc, sr, dr, sys_val, dia_val, text, level, codes, note,
    ) in enumerate(NARRATIVE_SCENARIOS, start=1):
        rows.append(
            {
                "id": f"narrative-{i:03d}",
                "category": "narrative",
                "medication_stopped": ms,
                "missed_dose_count": mdc,
                "supply_remaining": sr,
                "difficulty_reported": dr,
                "difficulty_text": text,
                "systolic": sys_val,
                "diastolic": dia_val,
                "expected_risk_level": level,
                "expected_reason_codes": codes,
                "notes": note,
            }
        )
    return rows


def main():
    rows = generate_structured_rows() + generate_narrative_rows()
    with OUT_PATH.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row) + "\n")
    print(f"Wrote {len(rows)} labeled rows to {OUT_PATH}")
    print(f"  structured_boundary: {sum(1 for r in rows if r['category'] == 'structured_boundary')}")
    print(f"  narrative:           {sum(1 for r in rows if r['category'] == 'narrative')}")


if __name__ == "__main__":
    main()
