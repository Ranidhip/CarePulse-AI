"""
Small helper for "does this row exist" lookups.

Root cause this exists to avoid: postgrest-py 0.16.11 (bundled with
supabase-py 2.7.4)'s .maybe_single().execute() returns a BARE None — not
a response object with .data = None — when zero rows match. See
postgrest._sync.request_builder.SyncMaybeSingleRequestBuilder.execute(),
which explicitly does `return None` on a "0 rows" APIError. Calling
.data on that crashes with AttributeError. This is not hypothetical: it's
the exact error the seed script hit against a real Supabase project the
first time it queried a table for a row that (correctly) didn't exist yet.

Fix: never use .maybe_single() or .single() in this codebase. Use
.limit(1).execute() instead, which always returns a normal response
object with .data as a list — empty when nothing matches, one item when
something does — and is safe to check defensively with no special-casing
for a "zero rows" case that behaves differently from every other case.
"""

from typing import Any


def one_or_none(builder: Any) -> dict | None:
    """
    Appends .limit(1) to `builder`, executes it, and returns the first
    matching row as a dict, or None if no row matched.

    `builder` must NOT already have .single() or .maybe_single() called
    on it — pass the query chain up through the last .eq()/.select().
    """
    response = builder.limit(1).execute()
    if response is None or not response.data:
        return None
    return response.data[0]
