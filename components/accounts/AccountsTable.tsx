"use client";

import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import type { AccountListRow } from "@/lib/types";

const COLUMNS = [
  "Account",
  "Domain",
  "Segment",
  "Industry",
  "Geography",
  "Owner",
  "Overall score",
  "Lifecycle stage",
  "Last signal",
];

function scoreTone(score: number): "positive" | "warning" | "neutral" {
  if (score >= 80) return "positive";
  if (score >= 65) return "warning";
  return "neutral";
}

export function AccountsTable({ rows }: { rows: AccountListRow[] }) {
  const router = useRouter();

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-left">
          <thead className="bg-panel-muted/80">
            <tr>
              {COLUMNS.map((label) => (
                <th
                  key={label}
                  className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-5 py-16 text-center">
                  <Building2 className="mx-auto mb-3 size-8 text-muted-foreground/40" />
                  <p className="font-semibold text-foreground">No accounts found</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Try adjusting your search or clearing the filters.
                  </p>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  className="cursor-pointer bg-white/70 transition-colors hover:bg-panel-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                  onClick={() => router.push(`/accounts/${row.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/accounts/${row.id}`);
                    }
                  }}
                  aria-label={`View account ${row.name}`}
                >
                  <td className="px-5 py-4">
                    <p className="font-semibold text-foreground">{row.name}</p>
                  </td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">{row.domain}</td>
                  <td className="px-5 py-4 text-sm text-foreground">{row.segment}</td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">—</td>
                  <td className="px-5 py-4 text-sm text-foreground">{row.geography}</td>
                  <td className="px-5 py-4 text-sm text-foreground">{row.owner}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-lg font-semibold text-foreground">
                        {row.score}
                      </span>
                      <Badge tone={scoreTone(row.score)}>
                        {row.score >= 80 ? "Hot" : row.score >= 65 ? "Warm" : "Cold"}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-foreground">{row.stage}</td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">{row.lastSignalAt}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
