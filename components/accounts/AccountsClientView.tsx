"use client";

import { Search, X } from "lucide-react";
import { useState } from "react";

import { AccountsTable } from "@/components/accounts/AccountsTable";
import { Badge } from "@/components/shared/Badge";
import { formatEnumLabel } from "@/lib/formatters/display";
import type { AccountListRow, SelectOption } from "@/lib/types";

type Props = {
  rows: AccountListRow[];
  options: {
    segments: SelectOption[];
  };
};

const SCORE_BUCKET_OPTIONS = [
  { value: "hot", label: "Hot (≥ 80)" },
  { value: "warm", label: "Warm (65–79)" },
  { value: "cold", label: "Cold (< 65)" },
];

export function AccountsClientView({ rows, options }: Props) {
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("");
  const [scoreBucket, setScoreBucket] = useState("");

  const hasActiveFilters = search !== "" || segment !== "" || scoreBucket !== "";

  const filtered = rows.filter((row) => {
    const q = search.trim().toLowerCase();
    if (q && !row.name.toLowerCase().includes(q) && !row.domain.toLowerCase().includes(q)) {
      return false;
    }
    if (segment && formatEnumLabel(segment) !== row.segment) {
      return false;
    }
    if (scoreBucket === "hot" && row.score < 80) return false;
    if (scoreBucket === "warm" && (row.score < 65 || row.score >= 80)) return false;
    if (scoreBucket === "cold" && row.score >= 65) return false;
    return true;
  });

  function clearFilters() {
    setSearch("");
    setSegment("");
    setScoreBucket("");
  }

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
            placeholder="Search by name or domain"
            className="h-11 w-full rounded-2xl border border-border bg-panel-muted pl-11 pr-4 text-sm text-foreground outline-none focus:border-accent"
          />
        </label>

        {/* Segment */}
        <label className="space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Segment
          </span>
          <select
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
            className="h-11 w-full rounded-2xl border border-border bg-panel-muted px-3 text-sm text-foreground outline-none focus:border-accent"
          >
            <option value="">All segments</option>
            {options.segments.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {/* Score bucket */}
        <label className="space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Score bucket
          </span>
          <select
            value={scoreBucket}
            onChange={(e) => setScoreBucket(e.target.value)}
            className="h-11 w-full rounded-2xl border border-border bg-panel-muted px-3 text-sm text-foreground outline-none focus:border-accent"
          >
            <option value="">All scores</option>
            {SCORE_BUCKET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {/* Result count + clear */}
        <div className="flex items-end gap-2 pb-0.5">
          <Badge tone="neutral">
            {filtered.length} {filtered.length === 1 ? "account" : "accounts"}
          </Badge>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-8 items-center gap-1.5 rounded-2xl border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-panel-muted hover:text-foreground"
            >
              <X className="size-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      <AccountsTable rows={filtered} />
    </div>
  );
}
