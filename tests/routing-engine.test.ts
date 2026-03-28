import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { getRoutingDecisionsForEntity, routeAccount, routeLead, simulateRouting } from "@/lib/routing";

import { resetDatabase } from "./helpers/db";

before(() => {
  resetDatabase();
});

after(() => {
  resetDatabase();
});

test("seeded routing decisions cover named owner, territory, round robin, strategic, and ops review branches", async () => {
  const [northstar, brightHarbor, cedarLoop, ironPeak, novachannel] = await Promise.all([
    getRoutingDecisionsForEntity("lead", "acc_northstar_analytics_lead_01"),
    getRoutingDecisionsForEntity("lead", "acc_brightharbor_retail_lead_01"),
    getRoutingDecisionsForEntity("lead", "acc_cedar_loop_lead_01"),
    getRoutingDecisionsForEntity("lead", "acc_ironpeak_lead_01"),
    getRoutingDecisionsForEntity("lead", "acc_novachannel_lead_01"),
  ]);

  assert.equal(northstar[0]?.decisionType, "named_account_owner");
  assert.equal(northstar[0]?.assignedOwner?.id, "usr_dante_kim");

  assert.equal(brightHarbor[0]?.decisionType, "territory_segment_rule");
  assert.equal(brightHarbor[0]?.assignedQueue, "na-west-smb");

  assert.equal(cedarLoop[0]?.decisionType, "round_robin_pool");
  assert.equal(cedarLoop[0]?.assignedOwner?.id, "usr_sarah_kim");

  assert.equal(ironPeak[0]?.decisionType, "strategic_tier_override");
  assert.equal(ironPeak[0]?.assignedOwner?.id, "usr_elena_morales");
  assert.equal(ironPeak[0]?.secondaryOwner?.id, "usr_sarah_kim");

  assert.equal(novachannel[0]?.decisionType, "ops_review_queue");
  assert.equal(novachannel[0]?.assignedOwner, null);
  assert.equal(novachannel[0]?.assignedQueue, "ops-review");
});

test("routeLead is idempotent when the effective routing outputs do not change", async () => {
  const before = await getRoutingDecisionsForEntity("lead", "acc_beaconops_lead_01");
  assert.equal(before.length, 1);

  const rerouted = await routeLead("acc_beaconops_lead_01", {
    effectiveAt: before[0]!.createdAtIso,
  });
  const after = await getRoutingDecisionsForEntity("lead", "acc_beaconops_lead_01");

  assert.ok(rerouted);
  assert.equal(rerouted.id, before[0]!.id);
  assert.equal(after.length, before.length);
  assert.equal(rerouted.decisionType, "existing_account_owner");
  assert.equal(rerouted.assignedOwner?.id, "usr_owen_price");
  assert.equal(rerouted.explanation.capacity.fallbackTriggered, true);
  assert.ok(rerouted.reasonCodes.includes("fallback_after_capacity"));
});

test("routeAccount persists an account-level decision and remains idempotent on repeat", async () => {
  const created = await routeAccount("acc_signalnest", {
    effectiveAt: "2026-03-27T20:00:00.000Z",
  });

  assert.ok(created);
  assert.equal(created.decisionType, "existing_account_owner");
  assert.equal(created.assignedOwner?.id, "usr_owen_price");

  const historyAfterCreate = await getRoutingDecisionsForEntity("account", "acc_signalnest");
  assert.equal(historyAfterCreate.length, 1);

  const repeated = await routeAccount("acc_signalnest", {
    effectiveAt: "2026-03-27T20:00:00.000Z",
  });
  const historyAfterRepeat = await getRoutingDecisionsForEntity("account", "acc_signalnest");

  assert.ok(repeated);
  assert.equal(repeated.id, created.id);
  assert.equal(historyAfterRepeat.length, historyAfterCreate.length);
});

test("simulateRouting returns structured strategic and ops-review outcomes", async () => {
  const [strategicSimulation, opsSimulation] = await Promise.all([
    simulateRouting({
      accountDomain: "ironpeakmfg.com",
      geography: "NA_WEST",
      segment: "STRATEGIC",
      accountTier: "STRATEGIC",
      temperature: "URGENT",
      leadSource: "Intent surge",
      inboundType: "Signal-driven",
    }),
    simulateRouting({
      accountDomain: "novachannelcommerce.com",
      geography: "APAC",
      segment: "MID_MARKET",
      accountTier: "TIER_2",
      temperature: "WARM",
      leadSource: "Pricing page revisit",
      inboundType: "Inbound",
      capacityScenario: "all_candidates_overloaded",
    }),
  ]);

  assert.equal(strategicSimulation.decisionType, "strategic_tier_override");
  assert.equal(strategicSimulation.simulatedOwner?.id, "usr_elena_morales");
  assert.equal(strategicSimulation.simulatedSecondaryOwner?.id, "usr_sarah_kim");
  assert.equal(strategicSimulation.explanation.assignment.escalationPolicyKey, "strategic-ae-sdr-pair");

  assert.equal(opsSimulation.decisionType, "ops_review_queue");
  assert.equal(opsSimulation.simulatedOwner, null);
  assert.equal(opsSimulation.simulatedQueue, "ops-review");
  assert.ok(opsSimulation.reasonCodes.includes("sent_to_ops_review"));
  assert.ok(opsSimulation.explanation.capacity.fallbackTriggered);
});
