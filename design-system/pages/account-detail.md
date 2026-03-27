# Account Detail Page — Design Overrides

> These rules override `design-system/MASTER.md` for the `/accounts/[id]` page only.
> For anything not listed here, fall back to MASTER.md.

**Page:** `/accounts/[id]`
**Route file:** `app/(workspace)/accounts/[id]/page.tsx`

---

## Page Layout

```
Back link row
AccountHeader card (full width)
AI Summary card (full width)
Two-column grid: xl:grid-cols-[1.3fr_0.7fr]
  Left:  Signal Timeline → Contacts → Related Leads (gap state)
  Right: Open Tasks → Score Breakdown → Audit Log
```

Main wrapper: `<div className="space-y-6">`

---

## AccountHeader Card

All 8 required fields in one full-width card.

**Row 1 — Identity (flex justify-between items-start gap-6):**
- Left: `<h1>` name + attribute chips row (domain, industry, geography, lifecycle)
- Right: Score display card

**Divider:** `<hr className="my-5 border-border" />`

**Row 2 — Classification + Owner (flex items-center justify-between flex-wrap gap-3):**
- Left: Segment badge (accent) + Status badge (score-gated tone) + Tier badge (neutral)
- Right: Owner pill with initials avatar + name + role

**Score heat rule:**
- `score >= 80` → `text-success`
- `score >= 65` → `text-warning`
- `score < 65` → `text-foreground`

**Status badge tone rule:**
- `score >= 80` → `positive`
- `score >= 65` → `warning`
- `score < 65` → `neutral`

**Owner initials avatar:**
```
size-7 rounded-xl bg-accent-muted text-accent text-xs font-bold
flex items-center justify-center shrink-0
```
Derive from: first letter of each word in owner name, max 2 chars, uppercase.

---

## Signal Timeline

Vertical dot-and-line pattern using pure Tailwind. No external library.

**Container:** `<div className="relative">`

**Each event item:**
```
<div className="relative flex gap-4 pb-6 last:pb-0">
  {/* Left column */}
  <div className="relative flex flex-col items-center">
    <div className="relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full border-2 [color by status]" />
    {!isLast && <div className="mt-1 w-px flex-1 bg-border" />}
  </div>
  {/* Content card */}
  <div className="min-w-0 flex-1 rounded-2xl border border-border bg-panel-muted/70 px-4 py-3">
    ...
  </div>
</div>
```

**Dot colors:**
- Matched/default: `border-accent bg-accent/20`
- Unmatched: `border-warning bg-warning/20`

**Content card structure:**
1. Row: event title (font-semibold) + status Badge
2. Row: source system chip + `·` + occurred-at time (text-xs text-muted-foreground)
3. Description text (text-sm leading-6 text-foreground mt-2)

---

## Contacts Grid

`grid gap-4 md:grid-cols-2`

Each contact card (`rounded-2xl border border-border bg-panel-muted/70 p-4`):
- Row: name (font-semibold) + department Badge (neutral)
- Title (text-sm text-muted-foreground mt-0.5)
- Contact row (mt-4 space-y-2): Mail icon + email (break-all), Phone icon + phone (if present)

---

## Related Leads — Data Gap State

`relatedLeads` is NOT in `AccountDetailView`. Renders a dashed placeholder.

```
rounded-2xl border border-dashed border-border py-8 text-center
```
Icon: TrendingUp
Heading: "Leads not surfaced in view model"
Body: "relatedLeads exists in AccountDetailContract but is not forwarded by getAccountDetail(). No backend change has been made."
Code tag for function name: `rounded bg-panel-muted px-1 py-0.5 font-mono text-xs`

---

## Open Tasks

Each task row (`rounded-2xl border border-border bg-panel-muted/70 p-4`):
1. Row: title (font-semibold) + priority Badge
2. Description (text-sm leading-6 text-muted-foreground mt-2)
3. Footer: `{task.owner} · due {task.dueAt}` (text-sm text-foreground mt-3)

**Priority badge tones:**
- Urgent → `danger`
- High → `warning`
- Medium / Low → `neutral`

---

## Score Breakdown

Each score row (`rounded-2xl border border-border bg-panel-muted/70 p-4`):
1. Row: component label (font-semibold) + delta value (`font-mono text-lg font-semibold`)
2. Reason code (text-sm leading-6 text-muted-foreground mt-2)

Delta sign: always show `+{value}` — values come from score history deltas.

---

## Audit Log

Each audit row (`rounded-2xl border border-border bg-panel-muted/70 p-4`):
**Fix:** `bg-white/70` was used here — correct class is `bg-panel-muted/70`.

1. Row: event type label (font-semibold) + created-at timestamp (text-xs text-muted-foreground)
2. Explanation (text-sm leading-6 text-foreground mt-2)
3. Actor line: `Actor · {actorName}` (text-xs uppercase tracking-[0.14em] text-muted-foreground mt-2)

---

## SectionCard Component

Used for every section. Eyebrow + title + icon in header row.

Props: `icon`, `eyebrow`, `title`, `count?`, `iconTone?` ("default" | "accent"), `children`, `className?`

Header layout: `flex items-center justify-between gap-3`

---

## Empty States

Pattern for all sections with no data:
```
flex flex-col items-center gap-3 py-8 text-center
  icon chip (rounded-2xl border border-border bg-panel-muted p-3 text-muted-foreground)
  p.font-semibold.text-sm.text-foreground
  p.text-sm.text-muted-foreground
```

| Section | Icon | Heading |
|---|---|---|
| Signal timeline | Activity | No signals recorded |
| Contacts | UserX | No contacts on file |
| Open tasks | CheckCircle2 | All caught up |
| Score breakdown | BarChart3 | No score history |
| Audit log | ClipboardList | No audit entries |

---

## Accessibility (this page)

- `<h1>` only in AccountHeader (account name)
- All SectionCard titles use `<h2>`
- Back link: `aria-label="Back to accounts list"`
- Owner pill: `aria-label="Account owner: {name}"`
- Contact email links: `aria-label="Email {name}"`
- All Badge elements are `<span>` (non-interactive) — no aria needed
- Score display: `aria-label="Overall score: {score}"`
