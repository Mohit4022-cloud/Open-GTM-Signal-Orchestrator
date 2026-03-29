import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { LeadStatus, LifecycleStage, SlaStatus, Temperature } from "@prisma/client";

import { POST as ingestSignalPost } from "@/app/api/signals/route";
import { GET as leadGet } from "@/app/api/leads/[id]/route";
import { db } from "@/lib/db";
import { getAccountById } from "@/lib/queries/accounts";

import { resetDatabase } from "./helpers/db";

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await resetDatabase();
});

test("urgent inbound request-demo flow persists routing, SLA, tasks, and audit state end to end", async () => {
  await db.account.update({
    where: { id: "acc_atlas_grid" },
    data: {
      lifecycleStage: LifecycleStage.ENGAGED,
    },
  });
  await db.task.deleteMany({
    where: {
      accountId: "acc_atlas_grid",
      taskType: {
        in: ["CALL", "EMAIL", "HANDOFF"],
      },
    },
  });
  await db.lead.update({
    where: { id: "acc_atlas_grid_lead_01" },
    data: {
      inboundType: "Inbound",
      temperature: Temperature.HOT,
      status: LeadStatus.WORKING,
      firstResponseAt: null,
      slaBreachedAt: null,
      slaStatus: SlaStatus.ON_TRACK,
    },
  });

  const beforeAccount = await getAccountById("acc_atlas_grid");
  const beforeLead = beforeAccount?.relatedLeads.find((lead) => lead.id === "acc_atlas_grid_lead_01");
  const beforeEnrichmentTaskCount =
    beforeAccount?.openTasks.filter(
      (task) =>
        task.reasonSummary.primaryCode === "missing_contact_data_requires_enrichment" &&
        task.ownerId === "usr_elena_morales",
    ).length ?? 0;
  const referenceTime = new Date(Date.now() + 10 * 60 * 1000);
  referenceTime.setSeconds(0, 0);
  const occurredAt = new Date(referenceTime.getTime() - 60 * 1000);
  const expectedDueAtIso = new Date(referenceTime.getTime() + 15 * 60 * 1000).toISOString();

  const ingestResponse = await ingestSignalPost(
    new Request("http://localhost/api/signals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        source_system: "website",
        event_type: "form_fill",
        account_domain: "atlasgridsystems.com",
        contact_email: "kai.kim@atlasgridsystems.com",
        occurred_at: occurredAt.toISOString(),
        received_at: referenceTime.toISOString(),
        payload: {
          form_id: "request_demo",
          submission_id: "urgent_inbound_e2e_request_demo_1",
          campaign: "phase5-e2e",
        },
      }),
    }),
  );
  const ingestPayload = await ingestResponse.json();

  assert.equal(ingestResponse.status, 201);
  assert.equal(ingestPayload.outcome, "matched");
  assert.equal(ingestPayload.created, true);
  assert.equal(ingestPayload.matchedEntities.contact?.id, "acc_atlas_grid_contact_01");

  const leadResponse = await leadGet(
    new Request("http://localhost/api/leads/acc_atlas_grid_lead_01"),
    { params: Promise.resolve({ id: "acc_atlas_grid_lead_01" }) },
  );
  const leadPayload = await leadResponse.json();
  const account = await getAccountById("acc_atlas_grid");
  const relatedLead = account?.relatedLeads.find((lead) => lead.id === "acc_atlas_grid_lead_01");
  const enrichmentTasks =
    account?.openTasks.filter(
      (task) =>
        task.reasonSummary.primaryCode === "missing_contact_data_requires_enrichment" &&
        task.ownerId === "usr_elena_morales",
    ) ?? [];
  const newestEnrichmentTask = [...enrichmentTasks].sort((left, right) =>
    (right.dueAtIso ?? "").localeCompare(left.dueAtIso ?? ""),
  )[0];
  const taskCreatedCodes = account?.auditLog
    .filter((entry) => entry.actionCode === "task_created")
    .map((entry) => entry.reason.primaryCode);
  const leadRouteAudit = account?.auditLog.find(
    (entry) => entry.actionCode === "route_assigned" && entry.entity.leadId === "acc_atlas_grid_lead_01",
  );
  const leadSlaAudit = account?.auditLog.find(
    (entry) => entry.actionCode === "sla_assigned" && entry.entity.leadId === "acc_atlas_grid_lead_01",
  );
  const leadTaskAudit = account?.auditLog.find(
    (task) =>
      task.actionCode === "task_created" &&
      task.entity.leadId === "acc_atlas_grid_lead_01" &&
      task.reason.primaryCode === "missing_contact_data_requires_enrichment",
  );

  assert.equal(leadResponse.status, 200);
  assert.equal(leadPayload.currentOwnerId, "usr_elena_morales");
  assert.equal(typeof leadPayload.routing.currentQueue, "string");
  assert.equal(leadPayload.sla.isTracked, true);
  assert.equal(leadPayload.sla.currentState, "on_track");
  assert.equal(leadPayload.sla.policyKey, "sla_hot_inbound_15m");
  assert.equal(leadPayload.sla.dueAtIso, expectedDueAtIso);
  assert.equal(account?.metadata.id, "acc_atlas_grid");
  assert.ok(beforeLead);
  assert.ok(relatedLead);
  assert.ok((relatedLead?.score ?? 0) >= (beforeLead?.score ?? 0));
  assert.ok(account?.recentSignals.some((signal) => signal.id === ingestPayload.signalId));
  assert.equal(enrichmentTasks.length, beforeEnrichmentTaskCount + 1);
  assert.equal(newestEnrichmentTask?.reasonSummary.primaryCode, "missing_contact_data_requires_enrichment");
  assert.equal(newestEnrichmentTask?.ownerId, "usr_elena_morales");
  assert.ok(newestEnrichmentTask?.dueAtIso);
  assert.ok(Date.parse(newestEnrichmentTask?.dueAtIso ?? "") >= referenceTime.getTime());
  assert.ok(leadRouteAudit);
  assert.ok(leadSlaAudit);
  assert.ok(leadTaskAudit);
  assert.ok(taskCreatedCodes?.includes("missing_contact_data_requires_enrichment"));
});
