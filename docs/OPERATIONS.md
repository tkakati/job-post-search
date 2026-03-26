# Operations

Operational notes for local development, migrations, and deployments.

## Environment

Primary local env file:
- `.env.local` (copied from `.env.example`)

Key runtime defaults are validated in:
- `src/lib/env.ts`

## Database

Common commands:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

## Local Run

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run dev
```

## Deployment

- Frontend/API: Vercel
- Database: Postgres (Neon-ready)
- Apply migrations as part of release

## Notes

This is a placeholder operations document and should be expanded with:
- incident playbooks
- rollback steps
- observability checklist
- environment matrix (local/staging/prod)
