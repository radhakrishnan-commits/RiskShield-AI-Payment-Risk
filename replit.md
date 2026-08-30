# RISKSHIELD AI

An explainable payment risk intelligence command center that helps analysts investigate suspicious transactions and coordinated abuse.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/riskshield-ai/src/App.tsx` — responsive analyst-facing command center and route views
- `artifacts/riskshield-ai/src/index.css` — RiskShield visual tokens and motion utilities
- `artifacts/api-server/src/risk/data.ts` — logically generated synthetic scenarios, risk fusion, evidence, metrics, and ring data
- `artifacts/api-server/src/routes/risk.ts` — risk intelligence API routes
- `lib/api-spec/openapi.yaml` — source of truth for the generated API client and validation schemas
- `docs/architecture.md` — data flow and demo architecture

## Architecture decisions

- Risk fusion is explicit: 50% ML probability, 25% behavioral anomaly, and 25% graph connection risk.
- Synthetic labels come from named scenarios (rings, device/location novelty, amount deviation, velocity), not random assignment.
- Analyst recommendations are controlled to APPROVE, REVIEW, or HOLD; the API never performs irreversible payment actions.
- Demo records are intentionally in-memory to keep the hackathon build self-contained; production would replace the store with PostgreSQL and a trained model artifact.

## Product

The app includes a command center, transaction monitor, evidence-backed investigation workspace, abuse-ring explorer, what-if simulator, model intelligence metrics, business impact view, and audit history.

## User preferences

- The product should feel distinctive and production-style for a Razorpay Buildathon AI Intern submission, without exaggerating capabilities.

## Gotchas

- The generated API client must be regenerated after edits to `lib/api-spec/openapi.yaml`.
- The app explicitly labels its records as synthetic demonstration data.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
