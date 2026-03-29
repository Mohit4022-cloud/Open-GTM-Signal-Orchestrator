import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { SignalType } from "@prisma/client";

import { GET as actionsGet, POST as actionsPost } from "@/app/api/actions/route";
import { db } from "@/lib/db";

import { resetDatabase } from "./helpers/db";

before(async () => {
  await resetDatabase();
});

after(async () => {
  await resetDatabase();
});

test("GET /api/actions returns persisted recommendations for an entity", async () => {
  const response = await actionsGet(
    new Request("http://localhost/api/actions?entityType=account&entityId=acc_beaconops"),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.entityType, "account");
  assert.equal(payload.entityId, "acc_beaconops");
  assert.ok(payload.rows.length > 0);
  assert.ok(
    payload.rows.some(
      (recommendation: { recommendationType: string }) =>
        recommendation.recommendationType === "ADD_TO_NURTURE_QUEUE",
    ),
  );
});

test("POST /api/actions reruns deterministic generation and returns duplicate prevention metadata", async () => {
  const atlasDemoSignal = await db.signalEvent.findFirstOrThrow({
    where: {
      accountId: "acc_atlas_grid",
      eventType: SignalType.FORM_FILL,
    },
    orderBy: {
      receivedAt: "desc",
    },
    select: {
      id: true,
      receivedAt: true,
    },
  });

  const response = await actionsPost(
    new Request("http://localhost/api/actions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        entityType: "lead",
        entityId: "acc_atlas_grid_lead_01",
        effectiveAtIso: atlasDemoSignal.receivedAt.toISOString(),
        triggerSignalId: atlasDemoSignal.id,
      }),
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.entityType, "lead");
  assert.equal(payload.entityId, "acc_atlas_grid_lead_01");
  assert.ok(Array.isArray(payload.preventedDuplicateKeys));
});

test("GET /api/actions returns 400 for invalid query parameters", async () => {
  const response = await actionsGet(
    new Request("http://localhost/api/actions?entityId=acc_beaconops"),
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.code, "ACTION_VALIDATION_ERROR");
});

test("POST /api/actions returns 404 when the entity does not exist", async () => {
  const response = await actionsPost(
    new Request("http://localhost/api/actions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        entityType: "lead",
        entityId: "lead_missing",
      }),
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.code, "ACTION_NOT_FOUND");
});

test("GET /api/actions returns 500 when recommendation loading throws", async () => {
  const response = await actionsGet(
    new Request("http://localhost/api/actions?entityType=account&entityId=acc_beaconops", {
      headers: {
        "x-force-error": "1",
      },
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 500);
  assert.equal(payload.code, "ACTION_INTERNAL_ERROR");
});
