# Supabase project setup

Requires the Supabase CLI: https://supabase.com/docs/guides/cli

```bash
# From the CarePulse-AI root
supabase login
supabase init
supabase link --project-ref <your-project-ref>
```

If you don't have a Supabase project yet, create one at https://supabase.com
(free tier is fine for the MVP) before running `link`.

## Migrations

`migrations/` is empty until the ERD stage is finalized — each table gets
its own timestamped migration file, generated with:

```bash
supabase migration new <name>
```

Apply migrations locally with:

```bash
supabase db reset
```
