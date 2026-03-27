# GTM Signal Orchestrator — Design System Master

> When building a specific page, check `design-system/pages/[page].md` first.
> If that file exists, its rules override this file. Otherwise use this file exclusively.

**Generated:** 2026-03-26
**Style:** Data-Dense Dashboard — Minimal, internal-tool, operator workspace
**Inspiration:** Linear, Plain, Retool
**Audience:** Revenue operations teams, GTM engineers
**Goal:** Recruiter-friendly, data-dense, clarity over flash

---

## Color Tokens

All classes must use these Tailwind tokens. Do not use raw hex values.

| Token (Tailwind) | CSS Variable | Hex | Usage |
|---|---|---|---|
| `bg-background` | `--background` | `#f3f5f8` | Page background |
| `bg-panel` | `--panel` | `#ffffff` | Card / panel surfaces |
| `bg-panel-muted` | `--panel-muted` | `#f6f8fb` | Inner card backgrounds, row alternates |
| `bg-panel-elevated` | `--panel-elevated` | `#fbfcfd` | Elevated overlays |
| `text-foreground` | `--foreground` | `#14202b` | Primary text |
| `text-muted-foreground` | `--muted-foreground` | `#5e6b79` | Labels, secondary text, metadata |
| `border-border` | `--border` | `rgba(20,32,43,0.11)` | Standard borders |
| `border-border-strong` | `--border-strong` | `rgba(20,32,43,0.18)` | Emphasized borders |
| `text-accent` / `bg-accent` | `--accent` | `#0f766e` | Teal accent — CTAs, active states |
| `bg-accent-muted` | `--accent-muted` | `rgba(15,118,110,0.10)` | Accent backgrounds on chips/icons |
| `text-success` / `bg-success` | `--success` | `#18794e` | Positive status |
| `text-warning` / `bg-warning` | `--warning` | `#b66a1d` | Warning / warm status |
| `text-danger` / `bg-danger` | `--danger` | `#b42318` | Error / danger status |

---

## Typography

| Role | Font | Tailwind |
|---|---|---|
| Body / UI | Manrope | `font-sans` (default) |
| Numbers / Code / Scores | IBM Plex Mono | `font-mono` |

**Scale rules:**
- Metric / score values: `font-mono text-3xl font-semibold` or `font-mono text-4xl`
- Section titles (h2): `text-xl font-semibold text-foreground`
- Page title (h1): `text-2xl font-semibold tracking-tight text-foreground`
- Eyebrow labels: `text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground`
- Body text: `text-sm text-foreground leading-6` or `leading-7` for paragraphs
- Secondary / metadata: `text-sm text-muted-foreground`
- Micro labels: `text-xs text-muted-foreground`
- Line height body: 1.5–1.75 (`leading-6` or `leading-7`)
- Max line length: 65–75 characters (`max-w-prose`)

---

## Spacing

| Token | Value | Tailwind | Usage |
|---|---|---|---|
| xs | 4px | `gap-1` / `p-1` | Icon gaps |
| sm | 8px | `gap-2` / `p-2` | Inline spacing |
| md | 16px | `gap-4` / `p-4` | Standard item padding |
| lg | 24px | `gap-6` / `p-6` | Card padding, section gaps |
| xl | 32px | `gap-8` | Large section spacing |

---

## Shadows

| Level | Value | Usage |
|---|---|---|
| `shadow-[var(--shadow-sm)]` | `0 10px 30px rgba(20,32,43,0.06)` | All Card components |

Do not use `shadow-md` or `shadow-lg` — only `shadow-[var(--shadow-sm)]`.

---

## Components

### Card
```
rounded-3xl border border-border bg-panel shadow-[var(--shadow-sm)]
```
Use `Card` component from `components/shared/Card.tsx`.

### Inner item rows (inside cards)
```
rounded-2xl border border-border bg-panel-muted/70 p-4
```

### Attribute chip (compact metadata)
```
rounded-xl border border-border bg-panel-muted/80 px-3 py-2
```
Label: `text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground`
Value: `text-sm font-medium text-foreground mt-0.5`

### Large attribute box (2×2 grid)
```
rounded-2xl border border-border bg-panel-muted/80 p-4
```
Label: `text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground`
Value: `mt-3 text-sm font-semibold text-foreground`

### Badge
Use `Badge` component from `components/shared/Badge.tsx`.
Tone map: `neutral` | `accent` | `positive` | `warning` | `danger`

### Icon chip (section header)
Default: `rounded-2xl border border-border bg-panel-muted p-2 text-foreground`
Accent: `rounded-2xl border border-accent/15 bg-accent-muted p-2 text-accent`

### Score display card
```
rounded-[28px] border border-border bg-panel px-5 py-4 shadow-[var(--shadow-sm)]
```
Eyebrow: `text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground`
Value: `font-mono text-4xl font-semibold mt-2`
Score heat colors: ≥80 → `text-success`, ≥65 → `text-warning`, <65 → `text-foreground`

### Back navigation link
```
inline-flex h-10 items-center gap-2 rounded-2xl border border-border bg-panel px-3 text-sm
font-medium text-muted-foreground hover:bg-panel-muted hover:text-foreground
```

### Source / system chip (inline in timeline)
```
rounded-lg border border-border bg-panel px-2 py-0.5 text-[11px] font-medium text-muted-foreground
```

---

## Badge Tones

| Tone | Usage |
|---|---|
| `accent` | Segment (Enterprise, SMB, etc.) |
| `positive` | Healthy, Matched, Completed |
| `warning` | Warm, Watch, Unmatched |
| `danger` | Urgent, At Risk, Overdue |
| `neutral` | Neutral metadata, count pills, tier |

---

## Borders and Radius

| Pattern | Class |
|---|---|
| Page card | `rounded-3xl` |
| Section inner items | `rounded-2xl` |
| Compact chips | `rounded-xl` |
| Micro chips (source system) | `rounded-lg` |
| Avatar initials circle | `rounded-xl` |
| Owner pill | `rounded-2xl` |
| Score card | `rounded-[28px]` |
| Leads gap placeholder | `rounded-2xl border-dashed` |

---

## Transitions

All `a`, `button`, `select`, `input` have global transitions at 180ms ease (set in globals.css).
- Do not add `transition` classes to these elements — already covered.
- For other interactive elements: `transition-colors duration-[180ms]`
- Never use `transition` durations above 300ms.
- Respect `prefers-reduced-motion` — handled globally in globals.css.

---

## Icons

Use `lucide-react` exclusively. No emojis as icons.
Standard size: `size-5` in section headers, `size-4` in inline contexts.

---

## Anti-Patterns

- ❌ Raw hex colors — always use design token classes
- ❌ `bg-white/70` — use `bg-panel-muted/70`
- ❌ Ornate or decorative design
- ❌ `shadow-md` / `shadow-lg` — only `shadow-[var(--shadow-sm)]`
- ❌ Emojis as icons
- ❌ Missing `cursor-pointer` on interactive non-button elements
- ❌ Layout-shifting hover transforms (no `hover:scale-*` on cards)
- ❌ Low contrast: minimum 4.5:1 for normal text
- ❌ Invisible focus states

---

## Pre-Delivery Checklist

- [ ] All colors use design token classes (no raw hex)
- [ ] `bg-white/70` replaced with `bg-panel-muted/70`
- [ ] All icons from `lucide-react`, consistent `size-4` or `size-5`
- [ ] `cursor-pointer` on all clickable non-button elements
- [ ] Hover states use `hover:bg-panel-muted` pattern (no scale)
- [ ] Focus states visible (ring) on all keyboard-interactive elements
- [ ] Empty states present for every list/section
- [ ] Score values use `font-mono`
- [ ] Section headings use `<h2>` / page heading uses `<h1>`
- [ ] `aria-label` on icon-only buttons and back links
