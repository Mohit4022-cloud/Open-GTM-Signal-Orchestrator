import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { getDashboardTaskSummary } from "@/lib/actions";
import { db } from "@/lib/db";
import { withMissingTableFallback } from "@/lib/prisma-errors";
import {
  getDashboardData,
  getDashboardSummary,
  getWorkspaceTeasers,
} from "@/lib/queries/dashboard";

import { resetDatabase } from "./helpers/db";

async function renameRoutingDecisionTable(from: string, to: string) {
  await db.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  await db.$executeRawUnsafe(`ALTER TABLE "${from}" RENAME TO "${to}"`);
  await db.$executeRawUnsafe("PRAGMA foreign_keys = ON");
}

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await resetDatabase();
});

test("dashboard contracts stay stable when the RoutingDecision table is unavailable", async () => {
  await renameRoutingDecisionTable("RoutingDecision", "RoutingDecision__backup");

  try {
    const [summary, dashboardData, teasers] = await Promise.all([
      getDashboardSummary(),
      getDashboardData(),
      getWorkspaceTeasers(),
    ]);

    const routedToday = summary.kpis.find((kpi) => kpi.key === "routedToday");

    assert.ok(routedToday, "Expected routedToday KPI to be present.");
    assert.equal(routedToday.rawValue, 0);
    assert.equal(routedToday.change, "0 recent routing decisions");
    assert.deepEqual(dashboardData.recentRoutingDecisions, []);
    assert.equal(teasers["routing-simulator"]?.teaserValue, "0");
    assert.equal(teasers.signals?.secondaryValue, "0");
  } finally {
    await renameRoutingDecisionTable("RoutingDecision__backup", "RoutingDecision");
  }
});

test("missing-table fallback does not swallow unrelated errors", async () => {
  await assert.rejects(
    () =>
      withMissingTableFallback(async () => {
        throw new Error("unexpected failure");
      }, [] as string[]),
    /unexpected failure/,
  );
});

test("dashboard task summary exposes stable phase 4 aggregate fields", async () => {
  const summary = await getDashboardTaskSummary();

  assert.equal(typeof summary.asOfIso, "string");
  assert.equal(typeof summary.openCount, "number");
  assert.equal(typeof summary.inProgressCount, "number");
  assert.equal(typeof summary.overdueCount, "number");
  assert.equal(typeof summary.urgentCount, "number");
  assert.equal(typeof summary.unassignedCount, "number");
  assert.equal(typeof summary.trackedSlaCount, "number");
  assert.equal(typeof summary.breachedCount, "number");
  assert.equal(typeof summary.dueSoonCount, "number");
});
