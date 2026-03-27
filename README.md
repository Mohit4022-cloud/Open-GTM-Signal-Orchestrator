# GTM Signal Orchestrator

Production-style internal tool for GTM signal orchestration, account visibility, and routing operations. The app is built with Next.js App Router, TypeScript, Tailwind CSS, Prisma, and local SQLite so it runs without any external services.

## Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS 4
- Prisma 7
- SQLite + `better-sqlite3` adapter
- Recharts for the dashboard visuals

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Apply the Prisma migration:

   ```bash
   npm run db:migrate
   ```

3. Seed the local database:

   ```bash
   npm run db:seed
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

## Available scripts

- `npm run dev` — start the Next.js dev server
- `npm run build` — create a production build
- `npm run start` — serve the production build
- `npm run lint` — run ESLint
- `npm run typecheck` — run `tsc --noEmit`
- `npm run db:migrate` — apply the Prisma migration locally
- `npm run db:seed` — seed the SQLite demo data
- `npm run db:reset` — reset the local database and rerun the seed
- `npm run db:studio` — open Prisma Studio

## Route coverage

Implemented:

- `/dashboard`
- `/accounts`
- `/accounts/[id]`

Placeholder modules:

- `/leads`
- `/tasks`
- `/signals`
- `/routing-simulator`
- `/settings`

## Seeded demo data

The repo seeds a deterministic GTM workspace with:

- 8 users
- 20 accounts
- 40 contacts
- 30 leads
- 100 signals
- 40 tasks
- 30 routing decisions
- 60 score history events
- 60 audit log entries

Use `/accounts/acc_summitflow_finance` or `/accounts/acc_ironpeak` for quick detail-page checks after seeding.

## Architecture notes

- The app is intentionally read-only in this first milestone.
- Prisma-backed server queries power the implemented pages.
- The reusable app shell keeps sidebar, header, page framing, and placeholder modules visually consistent.
- The "AI summary" card on account detail pages is deterministic local text built from seeded account and signal context.

## Verification

This starter is expected to pass:

- `npm run lint`
- `npm run typecheck`
- `npm run build`

The app should work fully offline after install, migration, and seed.
