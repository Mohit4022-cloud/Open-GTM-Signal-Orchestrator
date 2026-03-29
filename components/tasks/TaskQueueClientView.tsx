"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { TaskQueueTable } from "@/components/tasks/TaskQueueTable";
import { Badge } from "@/components/shared/Badge";
import type { TaskQueueItemContract } from "@/lib/contracts/actions";

const TASK_TYPE_OPTIONS = [
  { value: "CALL", label: "Call" },
  { value: "EMAIL", label: "Email" },
  { value: "RESEARCH", label: "Research" },
  { value: "HANDOFF", label: "Handoff" },
  { value: "REVIEW", label: "Review" },
  { value: "ENRICH", label: "Enrich" },
  { value: "ESCALATION", label: "Escalation" },
];

const PRIORITY_OPTIONS = [
  { value: "P1", label: "P1 · Urgent" },
  { value: "P2", label: "P2 · High" },
  { value: "P3", label: "P3 · Normal" },
  { value: "P4", label: "P4 · Low" },
];

type Props = {
  rows: TaskQueueItemContract[];
  totalCount: number;
};

export function TaskQueueClientView({ rows, totalCount: _ }: Props) {
  const [search, setSearch] = useState("");
  const [taskTypeFilter, setTaskTypeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  const hasActiveFilters =
    search !== "" || taskTypeFilter !== "" || priorityFilter !== "";

  function clearFilters() {
    setSearch("");
    setTaskTypeFilter("");
    setPriorityFilter("");
  }

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const q = search.trim().toLowerCase();
      if (q) {
        const titleMatch = row.title.toLowerCase().includes(q);
        const accountMatch =
          row.linkedEntity.accountName?.toLowerCase().includes(q) ?? false;
        const contactMatch =
          row.linkedEntity.contactName?.toLowerCase().includes(q) ?? false;
        const ownerMatch =
          row.owner?.name.toLowerCase().includes(q) ?? false;
        if (!titleMatch && !accountMatch && !contactMatch && !ownerMatch)
          return false;
      }
      if (taskTypeFilter && row.taskType !== taskTypeFilter) return false;
      if (priorityFilter && row.priorityCode !== priorityFilter) return false;
      return true;
    });
  }, [rows, search, taskTypeFilter, priorityFilter]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="grid gap-3 rounded-[28px] border border-border bg-panel p-4 shadow-[var(--shadow-sm)] lg:grid-cols-[1.5fr_0.9fr_0.9fr_auto]">
        {/* Search */}
        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-4 size-4 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by task, account, or owner"
            aria-label="Search tasks"
            className="h-11 w-full rounded-2xl border border-border bg-panel-muted pl-11 pr-4 text-sm text-foreground outline-none focus:border-accent"
          />
        </label>

        {/* Task type */}
        <label className="space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Type
          </span>
          <select
            value={taskTypeFilter}
            onChange={(e) => setTaskTypeFilter(e.target.value)}
            aria-label="Filter by task type"
            className="h-11 w-full rounded-2xl border border-border bg-panel-muted px-3 text-sm text-foreground outline-none focus:border-accent"
          >
            <option value="">All types</option>
            {TASK_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {/* Priority */}
        <label className="space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Priority
          </span>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            aria-label="Filter by priority"
            className="h-11 w-full rounded-2xl border border-border bg-panel-muted px-3 text-sm text-foreground outline-none focus:border-accent"
          >
            <option value="">All priorities</option>
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {/* Count + clear */}
        <div className="flex items-end gap-2 pb-0.5">
          <Badge tone="neutral">
            {filtered.length} {filtered.length === 1 ? "task" : "tasks"}
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
      <TaskQueueTable rows={filtered} />
    </div>
  );
}
