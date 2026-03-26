# Job Post Discovery

AI-assisted hiring post discovery and ranking focused on real hiring signals, not generic job listings.

## What It Does

- Runs a retrieval-plus-fresh discovery loop for relevant hiring posts.
- Scores and ranks leads with explainable signal breakdowns and provenance.
- Supports post-feed workflows with message generation and status tracking.
- Uses deterministic orchestration with LLM-assisted extraction/query generation.

## Architecture Snapshot

```
START -> planning_phase -> execution_routing
      -> retrieval_arm and/or query_generation
      -> search -> extraction_node -> combined_result -> scoring_node
      -> planning_phase or final_response_generation
```

The loop continues until quality targets are met or iteration limits are reached.

## Runtime Defaults

- `targetHighQualityLeads`: `20`
- `maxIterations`: `3`
- Env overrides:
  - `JOB_DISCOVERY_TARGET_NEW_LEADS`
  - `JOB_DISCOVERY_MAX_ITERATIONS`

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run db:seed   # optional
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API Surface

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/search-runs` | Start a run |
| `GET` | `/api/search-runs/:id` | Fetch run status/result |
| `GET` | `/api/history` | Fetch recent session history |
| `POST` | `/api/leads/:id/events` | Track lead events (`opened`, `clicked`, `helpful`, `not_helpful`, `hidden`) |
| `POST` | `/api/leads/:id/feedback` | Record explicit lead feedback |

Envelope format:
- success: `{ ok: true, data: ... }`
- error: `{ ok: false, error: { code, message, details?, requestId } }`

## Tech Stack

- Next.js App Router (Node runtime API routes)
- TypeScript + Zod contracts
- Tailwind + shadcn-style UI primitives
- LangGraph workflow orchestration
- Drizzle ORM + Postgres (Neon-ready, pgvector scaffolded)
- Optional Redis/Upstash
- Vitest + Playwright

## Testing

```bash
npm run test       # unit + integration
npm run test:e2e   # Playwright smoke
npm run build      # production build check
```

If Playwright browsers are missing:

```bash
npx playwright install
```

## Deployment Notes

- Deploy frontend/API routes on Vercel.
- Use production Postgres (Neon recommended).
- Run migrations in release flow (`npm run db:migrate`).
- Keep API routes on Node runtime.

## Deep Docs

- [Architecture details](docs/ARCHITECTURE.md)
- [Operations guide](docs/OPERATIONS.md)
- [API details](docs/API.md)
