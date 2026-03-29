import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { ScoreEntityType, SignalStatus } from "@prisma/client";

import { ingestSignal } from "@/lib/data/signals";
import { db } from "@/lib/db";
import { getRoutingDecisionsForEntity } from "@/lib/routing";
import {
  getAccountScoreBreakdown,
  getLeadScoreBreakdown,
  getScoreHistoryForEntity,
} from "@/lib/scoring";

import { resetDatabase } from "./helpers/db";

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await resetDatabase();
});

test("matched signal ingestion recomputes score and creates a normalized routing decision", async () => {
  const primaryContact = await db.contact.findUniqueOrThrow({
    where: {
      id: "acc_beaconops_contact_01",
    },
    select: {
      email: true,
    },
  });
  const [beforeAccount, beforeLead] = await Promise.all([
    getAccountScoreBreakdown("acc_beaconops"),
    getLeadScoreBreakdown("acc_beaconops_lead_01"),
  ]);
  const result = await ingestSignal({
    source_system: "product",
    event_type: "product_usage_milestone",
    account_domain: "beaconopspartners.com",
    contact_email: primaryContact.email,
    occurred_at: "2026-03-27T18:00:00.000Z",
    received_at: "2026-03-27T18:02:00.000Z",
    payload: {
      workspace_id: "signal_routing_integration_workspace",
      milestone: "connected_crm",
      user_id: "signal_routing_integration_user",
    },
  });
  const [afterAccount, afterLead, accountHistory, leadHistory, routingDecisions] =
    await Promise.all([
      getAccountScoreBreakdown("acc_beaconops"),
      getLeadScoreBreakdown("acc_beaconops_lead_01"),
      getScoreHistoryForEntity(ScoreEntityType.ACCOUNT, "acc_beaconops", { limit: 8 }),
      getScoreHistoryForEntity(ScoreEntityType.LEAD, "acc_beaconops_lead_01", { limit: 8 }),
      getRoutingDecisionsForEntity("lead", "acc_beaconops_lead_01"),
    ]);
  const routedDecision = routingDecisions.find(
    (decision) => decision.triggerSignalId === result.signalId,
  );

  assert.equal(result.status, SignalStatus.MATCHED);
  assert.ok(afterAccount);
  assert.ok(afterLead);
  assert.ok(beforeAccount);
  assert.ok(beforeLead);
  assert.ok(afterAccount.totalScore >= beforeAccount.totalScore);
  assert.ok(afterLead.totalScore >= beforeLead.totalScore);
  assert.ok(
    accountHistory.rows.some((row) => row.trigger.signalSummary?.signalId === result.signalId),
  );
  assert.ok(
    leadHistory.rows.some((row) => row.trigger.signalSummary?.signalId === result.signalId),
  );
  assert.ok(routedDecision);
  assert.equal(routedDecision?.assignedOwner?.id, "usr_owen_price");
  assert.equal(routedDecision?.assignedQueue, "na-west-smb");
  assert.equal(routedDecision?.slaTargetMinutes, 240);
  assert.deepEqual(routedDecision?.reasonCodes, [
    "existing_owner_preserved",
    "fallback_after_capacity",
    "sla_product_qualified_4h",
  ]);
  assert.deepEqual(
    routedDecision?.reasonDetails.map((detail) => detail.code),
    routedDecision?.reasonCodes,
  );
  assert.deepEqual(
    routedDecision?.explanation.reasonDetails.map((detail) => detail.code),
    routedDecision?.reasonCodes,
  );
  assert.deepEqual(
    routedDecision?.explanation.sla.reasonDetails.map((detail) => detail.code),
    ["sla_product_qualified_4h"],
  );
});
