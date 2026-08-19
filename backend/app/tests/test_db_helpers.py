"""
Regression test for the bug hit against a real Supabase project: calling
.maybe_single().execute() on a query with zero matching rows returns a
bare None (not a response object with .data = None), which crashed every
"does this row exist yet" check in the codebase — first surfaced by
backend/scripts/seed_synthetic_users.py, immediately after it correctly
created a new provider Auth account and then checked whether a matching
public.users row already existed (it didn't, which is exactly the case
that crashed).

The fix (app/core/db.py) is to never call .maybe_single()/.single()
anywhere in this codebase, and instead use one_or_none(), which appends
.limit(1) and safely reads .data as a list. These tests exercise
one_or_none() directly against both the real shape .limit(1) actually
returns (a response object with an empty or single-item list) and,
defensively, the bare-None shape that caused the original crash — so
that if any code path ever regresses back to .maybe_single()-like
behavior, this test catches it rather than a real Supabase project.
"""

from app.core.db import one_or_none


class FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeLimitQuery:
    """
    Mimics exactly what one_or_none() calls: .limit(1).execute(). This is
    the REAL shape a .limit(1) query returns — a response object whose
    .data is always a list, empty or with one row. This is the case that
    .maybe_single() got wrong and .limit(1) gets right.
    """

    def __init__(self, rows):
        self._rows = rows
        self.limited_to = None

    def limit(self, n):
        self.limited_to = n
        return self

    def execute(self):
        return FakeResponse(self._rows[: self.limited_to] if self.limited_to else self._rows)


class FakeNoneReturningQuery:
    """
    Defensive case: simulates something upstream still returning a bare
    None (the exact shape that crashed .maybe_single()-based code). Even
    though nothing in this codebase should produce this anymore,
    one_or_none() must not crash if it ever happens.
    """

    def limit(self, _n):
        return self

    def execute(self):
        return None


def test_one_or_none_returns_none_on_zero_rows():
    # This is the exact real-world case that crashed the seed script: a
    # brand-new row that correctly doesn't exist yet.
    assert one_or_none(FakeLimitQuery([])) is None


def test_one_or_none_returns_first_row_when_one_matches():
    row = {"id": "abc-123", "email": "provider@example.com"}
    assert one_or_none(FakeLimitQuery([row])) == row


def test_one_or_none_returns_first_row_when_multiple_would_match():
    # .limit(1) means only one row is ever returned to us regardless of
    # how many would match server-side; one_or_none() must return that
    # single row, not error or return a list.
    rows = [{"id": "first"}, {"id": "second"}]
    assert one_or_none(FakeLimitQuery(rows)) == {"id": "first"}


def test_one_or_none_does_not_crash_on_bare_none_response():
    # Defensive: must not regress to the original AttributeError even if
    # some future code path returns a bare None the way .maybe_single()
    # did.
    assert one_or_none(FakeNoneReturningQuery()) is None
