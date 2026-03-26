# Job Post Discovery

Production-minded MVP for AI-assisted hiring lead discovery.

## Stack

- Next.js App Router (Node runtime API routes)
- TypeScript + Zod contracts
- Tailwind + shadcn-style UI primitives
- LangGraph workflow orchestration
- Drizzle ORM on Postgres (Neon-ready, pgvector scaffolded)
- Optional Redis/Upstash
- Vitest + Playwright

## Quick Start

1) Install dependencies

```bash
npm install
```

2) Configure environment

```bash
cp .env.example .env.local
```

3) Run migrations

```bash
npm run db:migrate
```

4) Seed demo data

```bash
npm run db:seed
```

5) Start app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Required for runnable MVP:

- `DATABASE_URL`

Optional / recommended:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `OPENAI_API_KEY`
- `OPENAI_CHAT_MODEL` (defaults to `gpt-5.2` in code if unset; override e.g. `gpt-4o-mini` for cheaper local runs)
- `OPENAI_EMBEDDING_MODEL`
- `EMBEDDING_DIMENSIONS` (default 1536)
- `APIFY_PROFILE_SCRAPER_MAX_TOTAL_CHARGE_USD` (optional cap passed to LinkedIn profile-scraper runs)
- `JOB_DISCOVERY_TARGET_NEW_LEADS` (default 20)
- `JOB_DISCOVERY_MAX_ITERATIONS` (default 3)
- `NEXT_PUBLIC_APP_URL`
- `PLAYWRIGHT_BASE_URL`

## Local Development

- Dev server: `npm run dev`
- Lint: `npm run lint`
- Unit + integration tests: `npm run test`
- E2E smoke: `npm run test:e2e`
- Build verification: `npm run build`

If Playwright browsers are not installed yet:

```bash
npx playwright install
```

## Database and Migrations

- Generate migration: `npm run db:generate`
- Apply migrations: `npm run db:migrate`
- Seed sample records: `npm run db:seed`

The schema includes:

- Identity/session: `users`, `user_sessions`
- Search lifecycle: `search_runs`, `planner_runs`, `generated_queries`
- Leads and provenance: `leads`, `lead_sources`, `shown_leads`
- Tracking/events: `lead_events`
- Learning memory: `query_performance`
- Vector scaffold: `lead_embeddings` (pgvector)

## API Surface

- `POST /api/search-runs` start run
- `GET /api/search-runs/:id` fetch status/result
- `GET /api/history` recent run history for session
- `POST /api/leads/:id/events` event tracking (`opened`, `clicked`, `helpful`, `not_helpful`, `hidden`)
- `POST /api/leads/:id/feedback` explicit feedback payload

All APIs return clean envelopes:

- success: `{ ok: true, data: ... }`
- error: `{ ok: false, error: { code, message, details?, requestId } }`

## Agent Graph Overview

The runtime graph is composed of deterministic and LLM-assisted nodes:

1. `planning_phase` (deterministic)
2. `execution_routing`
3. `retrieval_arm` (optional)
4. `query_generation` (LLM or deterministic fallback)
5. `search`
6. `combined_result`
7. loop until stop condition
8. `final_response_generation`

Stop rules:

- stop when `>= 5` user-new leads, or
- stop when max iterations reached (`3` by default)

## Observability and Error Handling

- Structured JSON logger: `src/lib/observability/logger.ts`
- Frontend error boundaries:
  - `src/app/error.tsx`
  - `src/app/(product)/error.tsx`
- Route-level guarded error handling with request-scoped error envelopes

## Testing

- Unit tests for planner/retrieval/combined/final/search/query-gen
- Integration tests for search-run route flow (mocked service integration)
- Playwright smoke test for main UX flow

Test locations:

- `tests/unit`
- `tests/integration`
- `tests/e2e`

## Deploy to Vercel

1) Push repository to GitHub.
2) Import project in Vercel.
3) Set environment variables from `.env.example`.
4) Ensure production Postgres (Neon) is reachable.
5) Run migrations against production DB (`npm run db:migrate` in CI/CD or one-time release step).
6) Deploy.

Recommended:

- Use Vercel + Neon pooled connection string.
- Keep Node runtime for API routes.
- Enable log drains or external log forwarding for structured logs.

## Known Limitations / Future Improvements

- Search provider is still MVP-oriented and should be replaced with production integrations.
- Query-performance learning is persisted but not yet used for adaptive ranking beyond current flow.
- Save/hide controls are currently lightweight UI behavior; can be promoted to persistent per-user state.
- No auth yet (anonymous sessions only).
- E2E suite is smoke-level; expand with full run lifecycle coverage and visual regression if needed.
