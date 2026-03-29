"use client";

import {
  Flame,
  Route,
  Search,
  ShieldAlert,
  Users,
  UserX,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { LeadQueueTable } from "@/components/leads/LeadQueueTable";
import { Badge } from "@/components/shared/Badge";
import type { LeadQueueItemContract } from "@/lib/contracts/leads";
import { cn } from "@/lib/utils";

type QueueTabId = "all" | "hot" | "overdue_sla" | "unassigned" | "recently_routed";

type QueueTab = {
  id: QueueTabId;
  label: string;
  emptyIcon: React.ComponentType<{ className?: string }>;
  emptyLabel: string;
  emptyMessage: string;
};

const TABS: QueueTab[] = [
  {
    id: "all",
    label: "All Leads",
    emptyIcon: Users,
    emptyLabel: "No leads in queue",
    emptyMessage: "No leads match your current filters.",
  },
  {
    id: "hot",
    label: "Hot Leads",
    emptyIcon: Flame,
    emptyLabel: "No hot leads right now",
    emptyMessage: "Leads with HOT or URGENT temperature will appear here.",
  },
  {
    id: "overdue_sla",
    label: "Overdue SLA",
    emptyIcon: ShieldAlert,
    emptyLabel: "No SLA violations",
    emptyMessage: "All tracked leads are within their SLA windows.",
  },
  {
    id: "unassigned",
    label: "Unassigned",
    emptyIcon: UserX,
    emptyLabel: "All leads are assigned",
    emptyMessage: "No unowned leads are waiting in the queue.",
  },
  {
    id: "recently_routed",
    label: "Recently Routed",
    emptyIcon: Route,
    emptyLabel: "No recent routing",
    emptyMessage: "No leads have been routed in the past 24 hours.",
  },
];

const LEAD_STATUS_OPTIONS = [
  { value: "NEW", label: "New" },
  { value: "WORKING", label: "Working" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "NURTURING", label: "Nurturing" },
  { value: "DISQUALIFIED", label: "Disqualified" },
];

const TEMPERATURE_OPTIONS = [
  { value: "COLD", label: "Cold" },
  { value: "WARM", label: "Warm" },
  { value: "HOT", label: "Hot" },
  { value: "URGENT", label: "Urgent" },
];

type Props = {
  rows: LeadQueueItemContract[];
  totalCount: number;
};

export function LeadQueueClientView({ rows, totalCount: _ }: Props) {
  const [activeTab, setActiveTab] = useState<QueueTabId>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [temperatureFilter, setTemperatureFilter] = useState("");

  const hasActiveFilters =
    search !== "" || statusFilter !== "" || temperatureFilter !== "";

  function clearFilters() {
    setSearch("");
    setStatusFilter("");
    setTemperatureFilter("");
  }

  function handleTabChange(tabId: QueueTabId) {
    setActiveTab(tabId);
    clearFilters();
  }

  // Tab counts derived from full row set (not filtered)
  const tabCounts = useMemo(
    () => ({
      all: rows.length,
      hot: rows.filter((r) => r.queueFlags.isHot).length,
      overdue_sla: rows.filter((r) => r.queueFlags.isOverdueSla).length,
      unassigned: rows.filter((r) => r.queueFlags.isUnassigned).length,
      recently_routed: rows.filter((r) => r.queueFlags.isRecentlyRouted).length,
    }),
    [rows],
  );

  // Step 1: filter by active tab
  const tabFiltered = useMemo(() => {
    if (activeTab === "all") return rows;
    if (activeTab === "hot") return rows.filter((r) => r.queueFlags.isHot);
    if (activeTab === "overdue_sla")
      return rows.filter((r) => r.queueFlags.isOverdueSla);
    if (activeTab === "unassigned")
      return rows.filter((r) => r.queueFlags.isUnassigned);
    if (activeTab === "recently_routed")
      return rows.filter((r) => r.queueFlags.isRecentlyRouted);
    return rows;
  }, [rows, activeTab]);

  // Step 2: apply search + dropdowns
  const filtered = useMemo(() => {
    return tabFiltered.filter((row) => {
      const q = search.trim().toLowerCase();
      if (q) {
        const accountMatch = row.accountName.toLowerCase().includes(q);
        const contactMatch = row.contactName?.toLowerCase().includes(q) ?? false;
        const queueMatch =
          row.routing.currentQueue?.toLowerCase().includes(q) ?? false;
        if (!accountMatch && !contactMatch && !queueMatch) return false;
      }
      if (statusFilter && row.status !== statusFilter) return false;
      if (temperatureFilter && row.temperature !== temperatureFilter)
        return false;
      return true;
    });
  }, [tabFiltered, search, statusFilter, temperatureFilter]);

  const activeTabConfig = TABS.find((t) => t.id === activeTab)!;

  return (
    <div
      className="space-y-4"
      role="region"
      aria-label="Lead queue"
    >
      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Lead queue views"
        className="flex items-center gap-1.5 overflow-x-auto pb-1"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = tabCounts[tab.id];
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls="lead-queue-tabpanel"
              id={`lead-tab-${tab.id}`}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-accent/20 bg-accent-muted text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:bg-panel-muted hover:text-foreground",
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "inline-flex min-w-[22px] items-center justify-center rounded-full border px-1.5 py-0.5 text-[11px] font-semibold",
                  isActive
                    ? "border-accent/15 bg-accent/10 text-accent"
                    : "border-border bg-panel text-muted-foreground",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div
        role="tabpanel"
        id="lead-queue-tabpanel"
        aria-labelledby={`lead-tab-${activeTab}`}
        className="space-y-4"
      >
        <div className="grid gap-3 rounded-[28px] border border-border bg-panel p-4 shadow-[var(--shadow-sm)] lg:grid-cols-[1.5fr_0.9fr_0.9fr_0.9fr_auto]">
          {/* Search */}
          <label className="relative flex items-center">
            <Search className="pointer-events-none absolute left-4 size-4 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by contact, account, or queue"
              aria-label="Search leads"
              className="h-11 w-full rounded-2xl border border-border bg-panel-muted pl-11 pr-4 text-sm text-foreground outline-none focus:border-accent"
            />
          </label>

          {/* Status */}
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Status
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              className="h-11 w-full rounded-2xl border border-border bg-panel-muted px-3 text-sm text-foreground outline-none focus:border-accent"
            >
              <option value="">All statuses</option>
              {LEAD_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {/* Temperature */}
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Temperature
            </span>
            <select
              value={temperatureFilter}
              onChange={(e) => setTemperatureFilter(e.target.value)}
              aria-label="Filter by temperature"
              className="h-11 w-full rounded-2xl border border-border bg-panel-muted px-3 text-sm text-foreground outline-none focus:border-accent"
            >
              <option value="">All temperatures</option>
              {TEMPERATURE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {/* Count + clear */}
          <div className="flex items-end gap-2 pb-0.5">
            <Badge tone="neutral">
              {filtered.length} {filtered.length === 1 ? "lead" : "leads"}
            </Badge>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                aria-label="Clear all filters"
                className="inline-flex h-8 items-center gap-1.5 rounded-2xl border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-panel-muted hover:text-foreground"
              >
                <X className="size-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <LeadQueueTable
          rows={filtered}
          emptyIcon={activeTabConfig.emptyIcon}
          emptyLabel={activeTabConfig.emptyLabel}
          emptyMessage={activeTabConfig.emptyMessage}
        />
      </div>
    </div>
  );
}
