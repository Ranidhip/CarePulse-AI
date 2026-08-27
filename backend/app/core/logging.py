"""
Minimal app-wide logging setup.

Before this, only app/services/agents/orchestrator.py and
app/services/ai/analysis.py configured a logger at all — every other
route module (patient.py, checkins.py, auth.py, provider.py) had zero
server-side visibility into failures. A DB call failing/timing out
anywhere in those modules propagated as a bare, unlogged 500 with no
trace of what happened.

configure_logging() just sets a sane root format/level once at startup;
the actual catching-and-logging of unhandled errors happens in main.py's
global exception handler, which covers every route uniformly rather than
wrapping each individual Supabase call in its own try/except.
"""

import logging


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
