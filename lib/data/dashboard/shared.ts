import { Prisma } from "@prisma/client";

import type {
  DashboardAppliedFiltersContract,
  DashboardDemoMetaContract,
  DashboardDistributionItemContract,
  DashboardFiltersInput,
} from "@/lib/contracts/dashboard";
import type { RoutingReasonCode } from "@/lib/contracts/routing";
import { db } from "@/lib/db";
import { formatEnumLabel } from "@/lib/formatters/display";
import {
  buildRoutingReasonDetails,
  parseRoutingReasonCodes,
} from "@/lib/routing/reason-codes";

import {
  createDashboardWindow,
  formatUtcDateLabel,
  type DashboardResolvedWindow,
} from "./reference-time";

export type DashboardAccountScope = {
  filters: DashboardFiltersInput;
  accountIds: string[];
  accountDomains: string[];
  accountNamesById: Map<string, string>;
  hasScopedAccounts: boolean;
};

export async function getDashboardAccountScope(
  filters: DashboardFiltersInput,
): Promise<DashboardAccountScope> {
  const where: Prisma.AccountWhereInput = {};

  if (filters.segment) {
    where.segment = filters.segment;
  }

  if (filters.geography) {
    where.geography = filters.geography;
  }

  const hasScopedAccounts = Object.keys(where).length > 0;
  const accounts = hasScopedAccounts
    ? await db.account.findMany({
        where,
        select: {
          id: true,
          domain: true,
          name: true,
        },
      })
    : [];

  return {
    filters,
    accountIds: accounts.map((account) => account.id),
    accountDomains: accounts.map((account) => account.domain),
    accountNamesById: new Map(accounts.map((account) => [account.id, account.name])),
    hasScopedAccounts,
  };
}

export async function resolveDashboardWindow(
  filters: DashboardFiltersInput,
  accountScope: DashboardAccountScope,
): Promise<DashboardResolvedWindow> {
  if (filters.startDate || filters.endDate) {
    const explicitReference = filters.endDate
      ? new Date(`${filters.endDate}T12:00:00.000Z`)
      : new Date(`${filters.startDate!}T12:00:00.000Z`);

    return createDashboardWindow({
      referenceDate: explicitReference,
      startDate: filters.startDate,
      endDate: filters.endDate,
    });
  }

  const latestSignal = await db.signalEvent.findFirst({
    where: accountScope.hasScopedAccounts
      ? {
          OR: [
            {
              accountId: {
                in: accountScope.accountIds,
              },
            },
            {
              accountDomain: {
                in: accountScope.accountDomains,
              },
            },
          ],
        }
      : undefined,
    orderBy: {
      receivedAt: "desc",
    },
    select: {
      receivedAt: true,
    },
  });

  return createDashboardWindow({
    referenceDate: latestSignal?.receivedAt ?? new Date(),
  });
}

export function buildDashboardDemoMeta(
  referenceDate: Date,
): DashboardDemoMetaContract {
  return {
    dataMode: "demo_sample",
    label: "Demo scenario metrics",
    description:
      "All dashboard metrics are computed from seeded sample records and labeled benchmark scenarios.",
    referenceDateIso: referenceDate.toISOString(),
    referenceDateLabel: formatUtcDateLabel(referenceDate),
  };
}

export function buildAppliedFilters(
  filters: DashboardFiltersInput,
  window: DashboardResolvedWindow,
): DashboardAppliedFiltersContract {
  return {
    startDate: window.startDate,
    endDate: window.endDate,
    segment: filters.segment ?? "",
    geography: filters.geography ?? "",
  };
}

export function toDistributionItems(
  input: Array<{
    key: string;
    label: string;
    description: string;
    value: number;
  }>,
): DashboardDistributionItemContract[] {
  const total = input.reduce((sum, item) => sum + item.value, 0);

  return input.map((item) => ({
    ...item,
    share:
      total > 0 ? Number((item.value / total).toFixed(4)) : 0,
  }));
}

export function getPrimaryRoutingReasonCode(
  value: unknown,
): RoutingReasonCode | null {
  const reasonCodes = parseRoutingReasonCodes(value);
  const primaryDetail = buildRoutingReasonDetails(reasonCodes)[0];

  return primaryDetail?.code ?? reasonCodes[0] ?? null;
}

export function getPrimaryRoutingReasonMetadata(value: unknown) {
  const reasonCode = getPrimaryRoutingReasonCode(value);

  if (!reasonCode) {
    return null;
  }

  return buildRoutingReasonDetails([reasonCode], { includeNoisy: true })[0] ?? {
    code: reasonCode,
    label: formatEnumLabel(reasonCode),
    description: "Routing reason recorded in the demo policy trace.",
    category: "outcome" as const,
  };
}

export function isSignalInAccountScope(
  input: {
    accountId: string | null;
    accountDomain: string | null;
  },
  accountScope: DashboardAccountScope,
) {
  if (!accountScope.hasScopedAccounts) {
    return true;
  }

  return (
    (input.accountId !== null && accountScope.accountIds.includes(input.accountId)) ||
    (input.accountDomain !== null &&
      accountScope.accountDomains.includes(input.accountDomain))
  );
}
