# API

Detailed API reference for Job Post Discovery.

## Core Endpoints

- `POST /api/search-runs`
- `GET /api/search-runs/:id`
- `GET /api/history`
- `POST /api/leads/:id/events`
- `POST /api/leads/:id/feedback`

## Envelope Contract

Success:

```json
{ "ok": true, "data": {} }
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "string",
    "message": "string",
    "details": {},
    "requestId": "string"
  }
}
```

## Source of Truth

Route handlers:
- `src/app/api/search-runs/route.ts`
- `src/app/api/search-runs/[id]/route.ts`
- `src/app/api/history/route.ts`
- `src/app/api/leads/[id]/events/route.ts`
- `src/app/api/leads/[id]/feedback/route.ts`

Schemas:
- `src/lib/schemas/api.ts`
- `src/lib/schemas/contracts.ts`

## Notes

This is a placeholder API deep-dive and should be expanded with:
- request/response examples per endpoint
- error code catalog
- rate limits and retry semantics
