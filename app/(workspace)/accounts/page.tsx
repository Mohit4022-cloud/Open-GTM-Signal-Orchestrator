import { BarChart3, Building2, Flame, Star } from "lucide-react";

import { AccountsFilters } from "@/components/accounts/AccountsFilters";
import { AccountsTable } from "@/components/accounts/AccountsTable";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { getAccountsListData } from "@/lib/queries/accounts";

type AccountsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AccountsPage({ searchParams }: AccountsPageProps) {
  const resolvedSearchParams = await searchParams;
  const data = await getAccountsListData(resolvedSearchParams);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CRM workspace"
        title="Account coverage and score visibility"
        description="Use the seeded account list to inspect ownership, scoring posture, and recent signal activity. Filters persist in the URL so recruiter demos remain easy to navigate."
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">URL-driven filters</Badge>
            <Badge tone="neutral">20 seeded accounts</Badge>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-[28px] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Filtered accounts
          </p>
          <div className="mt-4 flex items-end justify-between">
            <p className="font-mono text-3xl font-semibold text-foreground">
              {data.stats.totalAccounts}
            </p>
            <Building2 className="size-5 text-accent" />
          </div>
        </Card>
        <Card className="rounded-[28px] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Average score
          </p>
          <div className="mt-4 flex items-end justify-between">
            <p className="font-mono text-3xl font-semibold text-foreground">
              {data.stats.averageScore}
            </p>
            <BarChart3 className="size-5 text-accent" />
          </div>
        </Card>
        <Card className="rounded-[28px] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Hot accounts
          </p>
          <div className="mt-4 flex items-end justify-between">
            <p className="font-mono text-3xl font-semibold text-foreground">{data.stats.hotAccounts}</p>
            <Flame className="size-5 text-success" />
          </div>
        </Card>
        <Card className="rounded-[28px] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Strategic coverage
          </p>
          <div className="mt-4 flex items-end justify-between">
            <p className="font-mono text-3xl font-semibold text-foreground">
              {data.stats.strategicAccounts}
            </p>
            <Star className="size-5 text-warning" />
          </div>
        </Card>
      </div>

      <AccountsFilters filters={data.filters} options={data.options} />
      <AccountsTable rows={data.rows} />
    </div>
  );
}
