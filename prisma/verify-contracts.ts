import { Segment } from "@prisma/client";

import { getAccountById, getAccounts } from "../lib/queries/accounts";
import {
  getDashboardSummary,
  getHotAccounts,
  getRecentSignals,
} from "../lib/queries/dashboard";

const DASHBOARD_KPI_KEYS = [
  "signalsReceivedToday",
  "routedToday",
  "unmatchedSignals",
  "hotAccounts",
  "slaBreaches",
  "averageSpeedToLead",
] as const;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const [summary, hotAccounts, recentSignals, allAccounts, strategicAccounts, ownerAccounts, hotBucketAccounts] =
    await Promise.all([
      getDashboardSummary(),
      getHotAccounts(),
      getRecentSignals(),
      getAccounts(),
      getAccounts({ segment: Segment.STRATEGIC }),
      getAccounts({ owner: "usr_elena_morales" }),
      getAccounts({ scoreBucket: "hot" }),
    ]);

  invariant(
    summary.kpis.length === DASHBOARD_KPI_KEYS.length,
    `Expected ${DASHBOARD_KPI_KEYS.length} dashboard KPIs, found ${summary.kpis.length}.`,
  );
  invariant(
    summary.kpis.every((kpi, index) => kpi.key === DASHBOARD_KPI_KEYS[index]),
    "Dashboard KPI keys are out of order or missing.",
  );
  invariant(
    summary.signalVolume14d.length === 14,
    `Expected 14 trend points, found ${summary.signalVolume14d.length}.`,
  );
  invariant(
    summary.slaHealth.length === 3,
    `Expected 3 SLA health points, found ${summary.slaHealth.length}.`,
  );

  invariant(hotAccounts.length > 0, "Expected at least one hot account.");
  invariant(hotAccounts.length <= 6, `Expected at most 6 hot accounts, found ${hotAccounts.length}.`);
  invariant(
    hotAccounts.every((account) => Boolean(account.segmentLabel) && Boolean(account.statusLabel)),
    "Hot accounts must include both raw enums and display labels.",
  );
  invariant(
    hotAccounts.every((account, index, accounts) => {
      if (index === 0) {
        return true;
      }

      const previous = accounts[index - 1];
      if (previous.score !== account.score) {
        return previous.score >= account.score;
      }

      const previousSignalAt = previous.lastSignalAtIso ? new Date(previous.lastSignalAtIso).getTime() : 0;
      const currentSignalAt = account.lastSignalAtIso ? new Date(account.lastSignalAtIso).getTime() : 0;

      if (previousSignalAt !== currentSignalAt) {
        return previousSignalAt >= currentSignalAt;
      }

      return previous.name.localeCompare(account.name) <= 0;
    }),
    "Hot accounts are not ordered by score, latest signal, then name.",
  );

  invariant(recentSignals.length === 8, `Expected 8 recent signals, found ${recentSignals.length}.`);
  invariant(
    recentSignals.some((signal) => signal.isUnmatched),
    "Expected at least one unmatched signal in the recent signal feed.",
  );

  const unmatchedSignal = recentSignals.find((signal) => signal.isUnmatched);
  invariant(unmatchedSignal, "Expected an unmatched recent signal.");
  invariant(
    unmatchedSignal.accountId === null &&
      unmatchedSignal.contactId === null &&
      unmatchedSignal.leadId === null,
    "Unmatched recent signals should preserve null relation fields.",
  );

  invariant(allAccounts.rows.length === 20, `Expected 20 accounts, found ${allAccounts.rows.length}.`);
  invariant(
    allAccounts.options.scoreBuckets.length === 3,
    `Expected 3 score bucket options, found ${allAccounts.options.scoreBuckets.length}.`,
  );
  invariant(
    strategicAccounts.rows.every((account) => account.segment === Segment.STRATEGIC),
    "Segment filters should return only the requested segment.",
  );
  invariant(
    ownerAccounts.rows.every((account) => account.ownerId === "usr_elena_morales"),
    "Owner filters should return only the requested owner.",
  );
  invariant(
    hotBucketAccounts.rows.every((account) => account.score >= 80),
    "Hot score bucket filters should only return scores >= 80.",
  );

  const accountDetail = await getAccountById("acc_summitflow_finance");
  invariant(accountDetail, "Expected seeded account detail for acc_summitflow_finance.");
  invariant(accountDetail.metadata.id === "acc_summitflow_finance", "Account detail metadata ID mismatch.");
  invariant(accountDetail.namedOwner !== null, "Expected account detail to include a named owner.");
  invariant(accountDetail.contacts.length > 0, "Expected account detail contacts.");
  invariant(accountDetail.relatedLeads.length > 0, "Expected account detail related leads.");
  invariant(accountDetail.recentSignals.length > 0, "Expected account detail recent signals.");
  invariant(accountDetail.openTasks.length > 0, "Expected account detail open tasks.");
  invariant(accountDetail.scoreBreakdown.length > 0, "Expected account detail score breakdown.");
  invariant(accountDetail.auditLog.length > 0, "Expected account detail audit log.");

  const missingAccount = await getAccountById("acc_missing");
  invariant(missingAccount === null, "Expected null for a missing account lookup.");

  console.log("Contract verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
