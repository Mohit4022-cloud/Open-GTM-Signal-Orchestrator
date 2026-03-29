import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { GET as leadsGet } from "@/app/api/leads/route";
import { GET as leadGet, PATCH as leadPatch } from "@/app/api/leads/[id]/route";

import { resetDatabase } from "./helpers/db";

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await resetDatabase();
});

test("GET /api/leads returns SLA-filtered queue rows", async () => {
  const response = await leadsGet(
    new Request("http://localhost/api/leads?slaState=breached&tracked=true"),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.ok(payload.totalCount >= 1);
  assert.ok(
    payload.rows.every(
      (lead: { sla: { isTracked: boolean; currentState: string } }) =>
        lead.sla.isTracked && lead.sla.currentState === "breached",
    ),
  );
});

test("GET /api/leads exposes routing and queue flags for phase 4 queue filters", async () => {
  const response = await leadsGet(
    new Request("http://localhost/api/leads?hot=true&recentlyRouted=true"),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.ok(payload.totalCount >= 1);
  assert.ok(
    payload.rows.every(
      (lead: {
        routing: { currentQueue: string | null; routedAtIso: string | null };
        queueFlags: {
          isHot: boolean;
          isOverdueSla: boolean;
          isUnassigned: boolean;
          isRecentlyRouted: boolean;
        };
      }) =>
        typeof lead.routing.currentQueue !== "undefined" &&
        typeof lead.routing.routedAtIso !== "undefined" &&
        lead.queueFlags.isHot === true &&
        lead.queueFlags.isRecentlyRouted === true,
    ),
  );
});

test("GET /api/leads returns 400 for invalid filters", async () => {
  const response = await leadsGet(
    new Request("http://localhost/api/leads?tracked=maybe"),
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.code, "LEAD_VALIDATION_ERROR");
});

test("GET /api/leads/:id returns lead detail with SLA events", async () => {
  const response = await leadGet(
    new Request("http://localhost/api/leads/acc_atlas_grid_lead_01"),
    { params: Promise.resolve({ id: "acc_atlas_grid_lead_01" }) },
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.id, "acc_atlas_grid_lead_01");
  assert.equal(payload.sla.currentState, "breached");
  assert.ok(Array.isArray(payload.events));
  assert.ok(
    payload.events.some((event: { eventType: string }) => event.eventType === "breached"),
  );
});

test("GET /api/leads/:id returns 404 for missing leads", async () => {
  const response = await leadGet(
    new Request("http://localhost/api/leads/lead_missing"),
    { params: Promise.resolve({ id: "lead_missing" }) },
  );
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.code, "LEAD_NOT_FOUND");
});

test("PATCH /api/leads/:id records first response and resolves the SLA", async () => {
  const response = await leadPatch(
    new Request("http://localhost/api/leads/acc_meridian_freight_lead_01", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        firstResponseAtIso: new Date().toISOString(),
      }),
    }),
    { params: Promise.resolve({ id: "acc_meridian_freight_lead_01" }) },
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.id, "acc_meridian_freight_lead_01");
  assert.equal(payload.sla.currentState, "completed");
  assert.equal(typeof payload.firstResponseAtIso, "string");
  assert.equal(payload.events[0]?.eventType, "met");
});

test("GET /api/leads returns 500 when the query throws", async () => {
  const response = await leadsGet(
    new Request("http://localhost/api/leads", {
      headers: {
        "x-force-error": "1",
      },
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 500);
  assert.equal(payload.code, "LEAD_INTERNAL_ERROR");
});
