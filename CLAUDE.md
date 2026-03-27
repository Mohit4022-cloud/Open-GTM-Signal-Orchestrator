# CLAUDE.md

## Project
GTM Signal Orchestrator is a production-style internal GTM operations tool.
The current goal is to build a polished, recruiter-friendly foundation milestone.

## Your role
You own the frontend and UI layer only.

You may:
- build and refine page UI
- create reusable presentational components
- improve layout, spacing, typography, charts, tables, badges, filters
- add loading, empty, error, and not-found states
- improve responsiveness
- improve visual consistency across pages

You may work in:
- app/dashboard/page.tsx
- app/accounts/page.tsx
- app/accounts/[id]/page.tsx
- components/**
- app/layout.tsx
- styling-related files
- small helper utilities used only for presentation

## Do not change
Do not modify these unless explicitly asked:
- prisma/schema.prisma
- app/api/**
- lib/db/**
- lib/scoring/**
- lib/routing/**
- seed scripts
- backend business logic
- data contracts and field names returned from server functions

## Frontend principles
- internal-tool aesthetic
- clean, modern, minimal
- recruiter-friendly screenshots
- clarity over flash
- desktop-first, but responsive
- use reusable components
- keep code simple and readable
- do not over-engineer

## Data contract rules
- treat backend return shapes as source of truth
- do not invent new backend fields
- do not rename fields in fetched data
- if a needed field is missing, note the gap clearly instead of faking a backend change
- prefer graceful UI fallbacks when data is absent

## Current implemented scope
The currently active pages are:
- /dashboard
- /accounts
- /accounts/[id]

Other routes can remain placeholders for now.

## UI requirements
Dashboard should include:
- KPI cards
- signal chart
- hot accounts table
- recent activity feed

Accounts page should include:
- searchable table
- segment and score filters
- clickable rows

Account detail page should include:
- account header
- metadata
- contacts
- leads summary
- signal timeline
- open tasks

## Styling guidance
- use Tailwind
- keep card design consistent
- use small tasteful badges for status fields
- avoid heavy UI libraries unless clearly necessary
- charts should be readable and simple
- empty states should feel intentional

## Collaboration boundary
Codex owns:
- schema
- seed data
- server data access
- APIs
- business logic

You should not step into backend ownership.
If a page needs missing backend data, call that out clearly.

## Output style
When making changes:
- explain what you changed
- explain which files were touched
- flag any backend dependency gaps
- keep diffs focused

Anthropic’s docs say Claude Code loads project memory like CLAUDE.md at the start of conversations and that more specific, concise instructions improve consistency.
