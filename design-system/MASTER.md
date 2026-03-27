# Design System — GTM Signal Orchestrator

> **Source of truth for all UI work.** When building a specific page, first check
> `design-system/pages/[page-name].md`. If that file exists, its rules override this file.
> If not, follow everything here strictly.
>
> Generated with UI UX Pro Max · 2026-03-26 · Style: Data-Dense Dashboard

---

## Project Profile

- **Type:** Internal GTM operations tool (operator console)
- **Audience:** Revenue operations / GTM practitioners
- **Aesthetic:** Clean, minimal, data-dense, recruiter-friendly
- **Mode:** Light only (no dark mode)
- **Priority:** Desktop-first, responsive down to tablet
- **Stack:** Next.js 16, React 19, Tailwind v4, Recharts, Lucide icons, TypeScript

---

## Color System

### CSS Variables (defined in `app/globals.css`)

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#f3f5f8` | Page background |
| `--background-accent` | `#eef2f4` | Subtle section tints |
| `--panel` | `#ffffff` | Card/panel background |
| `--panel-muted` | `#f6f8fb` | Muted card, table header |
| `--panel-elevated` | `#fbfcfd` | Elevated surface |
| `--foreground` | `#14202b` | Primary text |
| `--muted-foreground` | `#5e6b79` | Secondary text, labels |
| `--border` | `rgba(20, 32, 43, 0.11)` | Default borders |
| `--border-strong` | `rgba(20, 32, 43, 0.18)` | Emphasized borders |
| `--accent` | `#0f766e` | Teal — brand accent, CTAs |
| `--accent-foreground` | `#effcf9` | Text on accent bg |
| `--accent-muted` | `rgba(15, 118, 110, 0.1)` | Accent tint backgrounds |
| `--success` | `#18794e` | Positive state |
| `--warning` | `#b66a1d` | Warning/at-risk state |
| `--danger` | `#b42318` | Error/breach state |
| `--shadow-sm` | `0 10px 30px rgba(20, 32, 43, 0.06)` | Default card shadow |

### Semantic Tone Map

| Tone | Tailwind Class Prefix | Use For |
|------|-----------------------|---------|
| `default` | `text-accent` | Neutral informational |
| `positive` | `text-success` | Good metrics, hot status |
| `warning` | `text-warning` | At-risk, needs attention |
| `danger` | `text-danger` | SLA breach, critical |
| `neutral` | `text-foreground` | Standard content |

### Do Not Use
- ❌ Raw hex values in JSX — always use CSS variables via Tailwind tokens
- ❌ Dark-mode classes (`dark:`) — light mode only
- ❌ Zinc/slate/gray scales — use project tokens instead

---

## Typography

### Font Stack

| Role | Font | Variable | Usage |
|------|------|----------|-------|
| Body / UI | `Manrope` | `--font-sans` | All UI text, labels, paragraphs |
| Numbers / Code | `IBM Plex Mono` | `--font-mono` | Metric values, scores, IDs |

### Type Scale

| Class | Size | Weight | Usage |
|-------|------|--------|-------|
| Page title | `text-3xl font-semibold tracking-tight` | 600 | `<h1>` page headers |
| Section title | `text-xl font-semibold` | 600 | Card headings |
| Eyebrow | `text-xs font-semibold uppercase tracking-[0.16em]` | 600 | Section labels, card subtitles |
| Body | `text-sm leading-7` | 400 | Descriptions, explanations |
| Small / meta | `text-xs font-medium` | 500 | Timestamps, secondary info |
| Metric value | `font-mono text-3xl font-semibold tracking-tight` | 600 | KPI numbers |
| Score | `font-mono text-lg font-semibold` | 600 | Account scores |

### Rules
- Minimum body text: `text-sm` (14px) on desktop
- Line height body: `leading-7` (1.75) for readability
- Line length: max `max-w-3xl` for prose descriptions

---

## Spacing & Radius Tokens

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `rounded-3xl` | 24px | Cards (`Card` component), table wrappers |
| `rounded-[28px]` | 28px | Metric cards |
| `rounded-2xl` | 16px | Inner items (feed items, signal cards) |
| `rounded-xl` | 12px | Smaller widgets |
| `rounded-full` | 9999px | Badges, avatar dots |
| `rounded-[16px]` | 16px | Tooltip, chart popover |

### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `gap-2` | 8px | Badge internal gap, icon gaps |
| `gap-3` | 12px | Row item gaps |
| `gap-4` | 16px | Grid gaps (KPI row) |
| `gap-5` | 20px | Card internal gap |
| `gap-6` | 24px | Section gaps, chart row |
| `p-5` | 20px | Metric card padding |
| `p-6` | 24px | Standard card padding |
| `px-5 py-4` | 20px/16px | Table cell padding |
| `px-2.5 py-1` | 10px/4px | Badge padding |

---

## Component Patterns

### Card

```tsx
<section className="rounded-3xl border border-border bg-panel shadow-[var(--shadow-sm)]">
```
- Always `<section>` element (semantic landmark)
- `rounded-3xl` radius, white background, soft shadow
- Add `p-6` for standard padding inside

### Metric Card (KPI)

```tsx
<Card className="rounded-[28px] p-5">
  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
  <div className="mt-4 flex items-end justify-between gap-4">
    <p className="font-mono text-3xl font-semibold tracking-tight text-foreground">{value}</p>
    <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
      {change} <ArrowRight className="size-3.5" />
    </span>
  </div>
</Card>
```
- Slightly larger radius than standard cards (`rounded-[28px]`)
- Monospace value font
- Optional `icon` prop (top-right, Lucide icon, `size-4` or `size-5`, `text-muted-foreground`)
- Tone colors: `text-accent` / `text-success` / `text-warning` / `text-danger`

### Badge

```tsx
<Badge tone="accent|neutral|positive|warning|danger">{text}</Badge>
```
- `rounded-full`, `px-2.5 py-1`
- `text-[11px] font-semibold uppercase tracking-[0.14em]`
- Five tones with matching border + bg + text colors (see `components/shared/Badge.tsx`)
- Always use `Badge` component — never build custom inline badges

### Table (Hot Accounts, data lists)

```tsx
<div className="overflow-hidden rounded-3xl border border-border">
  <table className="min-w-full divide-y divide-border text-left">
    <thead className="bg-panel-muted/80">
      <tr>
        <th className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Column
        </th>
      </tr>
    </thead>
    <tbody className="divide-y divide-border">
      <tr className="bg-white/60 hover:bg-panel-muted/70 transition-colors cursor-pointer">
        <td className="px-5 py-4 text-sm text-foreground">Value</td>
      </tr>
    </tbody>
  </table>
</div>
```
- Outer wrapper: `rounded-3xl border border-border overflow-hidden`
- Header: `bg-panel-muted/80`, eyebrow-style column labels
- Row hover: `hover:bg-panel-muted/70 transition-colors`
- Clickable rows: `cursor-pointer`
- Score column: `font-mono text-lg font-semibold`

### Score Badge

Score-bucket color coding applied via `Badge` component:
| Score | Bucket | Badge tone |
|-------|--------|------------|
| ≥ 80 | Hot | `positive` |
| 65–79 | Warm | `warning` |
| < 65 | Cold | `neutral` |

### Chart Card

```tsx
<Card className="p-6">
  <div className="flex items-center justify-between gap-3">
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Eyebrow</p>
      <h2 className="mt-2 text-xl font-semibold text-foreground">Section title</h2>
    </div>
    <Badge tone="accent"><Icon className="mr-1 size-3.5" /> Label</Badge>
  </div>
  <div className="mt-6">
    {/* Chart component */}
  </div>
</Card>
```
- Chart height: `h-[280px]`
- Chart colors: teal `#0f766e` (signals), blue `#1d4ed8` (matched/secondary)
- Axis ticks: `fill: #5e6b79`, `fontSize: 12`
- Grid: `vertical={false}`, `stroke: rgba(20, 32, 43, 0.08)`
- Tooltip: `borderRadius: 16`, white bg, soft shadow

### Activity Feed (Timeline)

```tsx
<div className="space-y-0 relative">
  {/* vertical rail */}
  <div className="absolute left-[11px] top-4 bottom-4 w-px bg-border" />
  {items.map(item => (
    <div className="relative flex gap-4 py-4">
      {/* dot */}
      <div className="relative z-10 mt-1 size-[22px] shrink-0 rounded-full border-2 border-accent/30 bg-panel flex items-center justify-center">
        <div className="size-2 rounded-full bg-accent" />
      </div>
      {/* content */}
      <div className="flex-1 min-w-0">...</div>
    </div>
  ))}
</div>
```
- Left rail: 1px border line, absolutely positioned
- Dot: 22px circle, accent border + bg fill
- Item padding: `py-4`
- No dividers needed (spacing is sufficient)

### Page Header

```tsx
<PageHeader
  eyebrow="Section label"
  title="Page title"
  description="Supporting description..."
  actions={<Badge> ... </Badge>}
/>
```
- `eyebrow` renders as teal accent badge
- Title: `text-3xl font-semibold tracking-tight`
- Description: `text-sm leading-7 text-muted-foreground max-w-3xl`

---

## Layout Grid

### App Shell
- Sidebar: `272px` fixed width, sticky, desktop only
- Content: `minmax(0, 1fr)`, scrollable
- Top header: full-width, above content

### Dashboard Layout
```
Row 1: KPI cards      — grid gap-4, md:2-col, xl:3-col
Row 2: Charts         — xl:grid-cols-[1.55fr_1fr], gap-6
Row 3: Data + Feed    — xl:grid-cols-[1.45fr_0.95fr], gap-6
```

### Shell Inset
- Max width: constrained within content area
- Padding: `px-6 py-8` or similar (defined in `ShellInset.tsx`)

---

## Interaction & Animation

| Behavior | Spec |
|----------|------|
| Row hover | `hover:bg-panel-muted/70 transition-colors duration-150` |
| Button hover | `opacity: 0.9`, no layout shift |
| Link cursor | `cursor-pointer` on all interactive rows/cards |
| Chart tooltip | Appear/disappear on hover — no delay |
| Focus ring | `focus-visible:ring-2 focus-visible:ring-accent` |
| Reduced motion | Respect `prefers-reduced-motion` — skip transitions if set |

---

## Iconography

- Library: **Lucide React** (`lucide-react`) — consistent `size-{n}` prop
- Standard sizes: `size-3.5` (badge), `size-4` (inline), `size-5` (card header)
- Color: inherit from parent (`text-muted-foreground`, `text-accent`, etc.)
- No emojis as icons — ever

### KPI Icon Map

| KPI Label | Lucide Icon |
|-----------|-------------|
| Signals received today | `Activity` |
| Routed today | `Router` |
| Unmatched signals | `AlertTriangle` |
| Hot accounts | `Flame` |
| SLA breaches | `ShieldAlert` |
| Avg. speed-to-lead | `Timer` |

---

## Anti-Patterns

- ❌ Emojis as icons — use Lucide SVGs
- ❌ Raw hex values in Tailwind classes — use CSS variable tokens
- ❌ `grid-cols-*` that ignore the asymmetric dashboard ratios — use `[1.55fr_1fr]` etc.
- ❌ Missing `cursor-pointer` on clickable table rows or cards
- ❌ Instant state changes — all hover/focus transitions must be 150–300ms
- ❌ Invisible focus states — all interactive elements need `focus-visible:ring-*`
- ❌ Inventing backend fields — treat data contract as immutable
- ❌ Ornate decoration, gradients, shadows heavier than `--shadow-sm`
- ❌ Freelance Tailwind color choices (zinc, slate, gray) — use project tokens
- ❌ Framer Motion — not a project dependency; plain CSS transitions only

---

## Pre-Delivery Checklist

- [ ] All icons from Lucide (no emojis)
- [ ] All colors via CSS variable tokens (no raw hex in JSX)
- [ ] `cursor-pointer` on all clickable elements (table rows, linked cards)
- [ ] Hover transitions `transition-colors duration-150` or similar
- [ ] Focus states visible: `focus-visible:ring-2 focus-visible:ring-accent`
- [ ] TypeScript types — no `any`, no implicit types
- [ ] No backend files modified (check git diff)
- [ ] Score badges color-coded by bucket (≥80 green, 65–79 amber, <65 neutral)
- [ ] Empty states handled for all data arrays
- [ ] `aria-label` on icon-only buttons
