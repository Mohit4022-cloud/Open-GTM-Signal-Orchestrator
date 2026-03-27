import Link from "next/link";

import { Badge } from "@/components/shared/Badge";
import type { HotAccountRow } from "@/lib/contracts/data-access";

type Props = {
  accounts: HotAccountRow[];
};

function scoreTone(score: number): "positive" | "warning" | "neutral" {
  if (score >= 80) return "positive";
  if (score >= 65) return "warning";
  return "neutral";
}

const COLUMNS = ["Account", "Owner", "Segment", "Score", "Last signal"];

export function HotAccountsTable({ accounts }: Props) {
  if (accounts.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-3xl border border-border bg-panel-muted/40 text-sm text-muted-foreground">
        No hot accounts at this time
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-border">
      <table className="min-w-full divide-y divide-border text-left">
        <thead className="bg-panel-muted/80">
          <tr>
            {COLUMNS.map((label) => (
              <th
                key={label}
                scope="col"
                className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {accounts.map((account) => {
            const tone = scoreTone(account.score);
            return (
              <tr
                key={account.id}
                className="bg-white/60 transition-colors hover:bg-panel-muted/70"
              >
                <td className="px-5 py-4">
                  <Link
                    href={`/accounts/${account.id}`}
                    className="font-semibold text-foreground hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {account.name}
                  </Link>
                </td>
                <td className="px-5 py-4 text-sm text-foreground">{account.owner}</td>
                <td className="px-5 py-4">
                  <Badge tone="neutral">{account.segment}</Badge>
                </td>
                <td className="px-5 py-4">
                  <Badge tone={tone} className="font-mono text-sm tabular-nums">
                    {account.score}
                  </Badge>
                </td>
                <td className="px-5 py-4 text-sm text-muted-foreground">{account.lastSignalAt}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
