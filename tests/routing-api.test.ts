import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { POST as simulateRoutingPost } from "@/app/api/routing/simulate/route";
import { db } from "@/lib/db";

import { resetDatabase } from "./helpers/db";

before(async () => {
  await resetDatabase();
});

after(async () => {
  await resetDatabase();
});

test("POST /api/routing/simulate returns 200 with a structured routing decision", async () => {
  const response = await simulateRoutingPost(
    new Request("http://localhost/api/routing/simulate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        accountDomain: "beaconopspartners.com",
        geography: "NA_WEST",
        segment: "SMB",
        accountTier: "TIER_3",
        namedAccount: true,
        namedOwnerId: "usr_miles_turner",
        existingOwnerId: "usr_owen_price",
        leadSource: "Pricing page revisit",
        inboundType: "Inbound",
        temperature: "HOT",
        capacityScenario: "named_owner_overloaded",
      }),
    }),
  );

  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.policyVersion, "routing/v1");
  assert.equal(payload.decisionType, "existing_account_owner");
  assert.equal(payload.simulatedOwner?.id, "usr_owen_price");
  assert.equal(payload.simulatedQueue, "na-west-smb");
  assert.ok(Array.isArray(payload.reasonCodes));
  assert.deepEqual(payload.reasonCodes, [
    "existing_owner_preserved",
    "fallback_after_capacity",
    "sla_hot_inbound_15m",
  ]);
  assert.deepEqual(
    payload.reasonDetails.map((detail: { code: string }) => detail.code),
    payload.reasonCodes,
  );
  assert.equal(typeof payload.explanation.summary, "string");
  assert.ok(payload.explanation.summary.length > 0);
  assert.deepEqual(
    payload.explanation.reasonDetails.map((detail: { code: string }) => detail.code),
    payload.reasonCodes,
  );
  assert.deepEqual(
    payload.explanation.evaluatedPolicies[0].reasonDetails.map(
      (detail: { code: string }) => detail.code,
    ),
    payload.explanation.evaluatedPolicies[0].reasonCodes,
  );
  assert.deepEqual(
    payload.explanation.sla.reasonDetails.map((detail: { code: string }) => detail.code),
    payload.explanation.sla.reasonCodes,
  );
  assert.equal(payload.explanation.assignment.queue, payload.simulatedQueue);
});

test("POST /api/routing/simulate returns 400 for validation failures", async () => {
  const response = await simulateRoutingPost(
    new Request("http://localhost/api/routing/simulate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        geography: "UNKNOWN",
        capacityScenario: "not-a-scenario",
      }),
    }),
  );

  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.code, "ROUTING_SIMULATION_VALIDATION_ERROR");
  assert.match(payload.message, /validation failed/i);
  assert.equal(typeof payload.error, "string");
});

test("POST /api/routing/simulate returns 500 when routing configuration is unavailable", async () => {
  await db.ruleConfig.updateMany({
    where: {
      ruleType: "routing",
    },
    data: {
      isActive: false,
    },
  });

  const response = await simulateRoutingPost(
    new Request("http://localhost/api/routing/simulate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        accountDomain: "signalnestsoftware.com",
        geography: "NA_WEST",
        segment: "SMB",
        accountTier: "TIER_3",
        existingOwnerId: "usr_owen_price",
        leadSource: "Pricing page revisit",
        inboundType: "Inbound",
        temperature: "HOT",
      }),
    }),
  );

  const payload = await response.json();

  assert.equal(response.status, 500);
  assert.equal(payload.code, "ROUTING_SIMULATION_INTERNAL_ERROR");
  assert.match(payload.message, /routing simulation failed/i);
  assert.equal(typeof payload.error, "string");
});
