"""
Provider-facing clinical summary generation — isolated behind this one
function, per the AI-feature requirement: describes only submitted facts,
never diagnoses, prescribes, or recommends dosage changes.

This prototype ships the deterministic fallback only (no live OpenAI
call) — a scope cut made explicitly under the 6-hour deadline (see the
mentor progress report earlier in this project). The real OpenAI adapter
in app/services/ai/prompts.py and schemas.py is unaffected and can be
wired in later without changing this function's signature or the
"Prototype-generated summary" labelling contract the frontends rely on.
"""


def generate_fallback_summary(
    *,
    medication_stopped: bool,
    missed_dose_count: int | None,
    supply_bucket_label: str,
    systolic: int | None,
    diastolic: int | None,
    difficulty_reported: bool,
    difficulty_text: str | None,
) -> str:
    parts: list[str] = []

    if medication_stopped:
        parts.append("Patient reported stopping their medication.")
    elif missed_dose_count:
        plural = "" if missed_dose_count == 1 else "s"
        parts.append(f"Patient reported {missed_dose_count} missed dose{plural} this week.")
    else:
        parts.append("Patient reported no missed doses this week.")

    if supply_bucket_label:
        parts.append(f"Medicine supply remaining: {supply_bucket_label}.")

    if systolic is not None and diastolic is not None:
        parts.append(f"Latest recorded BP was {systolic}/{diastolic}.")

    if difficulty_reported and difficulty_text:
        parts.append(f'Patient noted: "{difficulty_text}"')
    elif difficulty_reported:
        parts.append("Patient reported difficulty following their treatment schedule.")

    parts.append("Provider review may be required based on the above.")

    return " ".join(parts)
