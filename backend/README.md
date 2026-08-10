# CarePulse AI — Backend (FastAPI)

## First-time setup

Run these from inside the `backend/` folder:

```bash
# 1. Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Create your local env file
cp .env.example .env
# (leave the values blank for now — they're not needed until the
#  Supabase/OpenAI integration stages)
```

## Run the server

```bash
uvicorn app.main:app --reload --port 8000
```

Then open http://localhost:8000/health — you should see:

```json
{"status": "ok", "service": "carepulse-ai-backend"}
```

## Run the tests

```bash
pytest
```

You should see 1 test pass (`test_health_check_returns_ok`).

## Lint / format

```bash
ruff check .
black .
```

## What's here so far

- `app/main.py` — app entrypoint + `/health` endpoint
- `app/core/config.py` — environment-variable settings
- `app/tests/test_health.py` — first test
- `app/api/`, `app/models/`, `app/services/rules/`, `app/services/ai/` — empty for now, filled in as each domain (auth, patients, check-ins, risk engine, AI adapter) is built
