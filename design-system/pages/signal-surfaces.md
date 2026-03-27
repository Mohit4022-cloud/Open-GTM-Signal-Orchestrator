# Signal Surfaces — Design Notes

> Page-specific overrides for: `/accounts/[id]` signal timeline, `/unmatched` queue page.
> All other rules inherit from `design-system/MASTER.md`.

**Generated:** 2026-03-27
**Phase 0 tools used:**
- Stitch MCP — project `12303972193291147506` (two screens: timeline + unmatched queue)
- 21st.dev audit — `vertical timeline status dots connector`, `status badge pill`, `data row card with chips`
- design-system/MASTER.md consulted

---

## 21st.dev Audit Decision

| Component | 21st.dev result | Decision |
|---|---|---|
| Vertical timeline | Found: Modern Timeline (framer-motion heavy, avatar-based, progress bars) | **Build from scratch** — 21st.dev components are marketing-style; our use case needs dense operator rows |
| Status badge pill | Found: Badge variants via shadcn | **Use existing** `components/shared/Badge.tsx` — already project-specific |
| Data row card | Found: Card + CardContent patterns | **Use existing** `rounded-2xl border border-border bg-panel-muted/70 p-4` pattern already in MASTER.md |

---

## Account Signal Timeline

### Dot color map (by status string)

| Status | Dot classes |
|---|---|
| `"Matched"` | `border-success bg-success/20` |
| `"Unmatched"` | `border-warning bg-warning/20` |
| `"Error"` | `border-danger bg-danger/20` |
| All others (`"Received"`, `"Normalized"`) | `border-accent bg-accent/20` |

### Event type icon map (by title string)

| Event title | Lucide icon |
|---|---|
| Pricing Page Visit | `TrendingUp` |
| Website Visit | `Globe` |
| High Intent Page Cluster Visit | `Zap` |
| Form Fill | `FileText` |
| Webinar Registration | `Calendar` |
| Product Signup | `UserPlus` |
| Product Usage Milestone | `BarChart2` |
| Email Reply | `Mail` |
| Meeting Booked | `CalendarCheck` |
| Meeting No Show | `CalendarX` |
| Third Party Intent Event | `Radar` |
| Manual Sales Note | `FileText` |
| Account Status Update | `RefreshCw` |
| (fallback) | `Activity` |

### Card anatomy

```
[dot] [connector line]    [title + EventIcon]         [StatusBadge]
                          [SourceChip] [occurredAt]
                          [description text]
```

---

## Unmatched Queue Page

### Page layout

```
PageHeader (eyebrow, h1, description, count badge)
  └─ Card p-6
       └─ SectionHeader (label, title, badge)
            └─ list of UnmatchedSignalRow items
                 OR EmptyState (ShieldAlert icon)
```

### Row anatomy

```
[displayTitle (bold)] [SourceChip]              [occurredAt (muted)]
[AccountDomain chip]  [ContactEmail chip]
[ReasonBadge]  [QueueBadge]
[payloadSummary (muted text)]
```

### AttributeChip states

- Value present → `text-sm font-medium text-foreground`
- Value absent (candidate is null) → `text-sm font-medium text-muted-foreground italic`

---

## Reusable Components Built

| Component | File | Notes |
|---|---|---|
| `SignalStatusBadge` | `components/signals/SignalStatusBadge.tsx` | Wraps `Badge` with tone from `getSignalStatusTone()` |
| `SignalSourceBadge` | `components/signals/SignalSourceBadge.tsx` | Plain `<span>` chip (lighter weight than Badge) |
| `TimelineItemCard` | `components/signals/TimelineItemCard.tsx` | Full timeline row: dot, connector, card |
| `UnmatchedSignalRow` | `components/signals/UnmatchedSignalRow.tsx` | Unmatched queue row card |
