import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import {
  ActionType,
  LeadStatus,
  LifecycleStage,
  SlaStatus,
  SignalCategory,
  SignalType,
  Temperature,
} from "@prisma/client";

import { getAuditLogForEntity } from "@/lib/audit/queries";
import { ingestSignal } from "@/lib/data/signals";
import { db } from "@/lib/db";
import { assignSlaForLead, runSlaBreachChecks } from "@/lib/sla";

import { resetDatabase } from "./helpers/db";

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await resetDatabase();
});

test("urgent inbound signal drives score, routing, task, SLA, and audit chronology without vague reasons", async () => {
  const [account, contact] = await Promise.all([
    db.account.findUniqueOrThrow({
      where: { id: "acc_atlas_grid" },
      select: { domain: true },
    }),
    db.contact.findUniqueOrThrow({
      where: { id: "acc_atlas_grid_contact_01" },
      select: { email: true },
    }),
  ]);
  const receivedAt = new Date("2026-04-01T12:00:00.000Z");

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

  const result = await ingestSignal({
    source_system: "website",
    event_type: "form_fill",
    account_domain: account.domain,
    contact_email: contact.email,
    occurred_at: "2026-04-01T11:59:00.000Z",
    received_at: receivedAt.toISOString(),
    payload: {
      form_id: "request_demo",
      submission_id: "phase4_audit_request_demo_1",
      campaign: "phase4-audit",
    },
  });

  const [triggeredTasks, accountAudit] = await Promise.all([
    db.task.findMany({
      where: {
        leadId: "acc_atlas_grid_lead_01",
        triggerSignalId: result.signalId,
      },
      select: {
        actionType: true,
        isSlaTracked: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
    getAuditLogForEntity("account", "acc_atlas_grid", { limit: 80 }),
  ]);

  const newRows = [...accountAudit]
    .filter((entry) => new Date(entry.timestampIso).getTime() >= receivedAt.getTime())
    .sort((left, right) => new Date(left.timestampIso).getTime() - new Date(right.timestampIso).getTime());

  const signalIngestedIndex = newRows.findIndex((entry) => entry.actionCode === "signal_ingested");
  const scoreRecomputedIndex = newRows.findIndex((entry) => entry.actionCode === "score_recomputed");
  const routeAssignedIndex = newRows.findIndex(
    (entry) => entry.actionCode === "route_assigned" && entry.entity.leadId === "acc_atlas_grid_lead_01",
  );
  const leadSlaAssignedIndex = newRows.findIndex(
    (entry) => entry.actionCode === "sla_assigned" && entry.entity.leadId === "acc_atlas_grid_lead_01",
  );
  const taskCreatedIndex = newRows.findIndex(
    (entry) => entry.actionCode === "task_created" && entry.entity.leadId === "acc_atlas_grid_lead_01",
  );

  assert.equal(result.created, true);
  assert.ok(triggeredTasks.length >= 1);
  assert.ok(signalIngestedIndex >= 0);
  assert.ok(scoreRecomputedIndex > signalIngestedIndex);
  assert.ok(routeAssignedIndex > scoreRecomputedIndex);
  assert.ok(leadSlaAssignedIndex > routeAssignedIndex);
  assert.ok(taskCreatedIndex > leadSlaAssignedIndex);

  const routeEntry = newRows[routeAssignedIndex]!;
  const leadSlaEntry = newRows[leadSlaAssignedIndex]!;
  const taskEntry = newRows[taskCreatedIndex]!;

  assert.ok(routeEntry.reason.primaryCode);
  assert.equal(leadSlaEntry.reason.primaryCode, "sla_hot_inbound_15m");
  assert.ok(taskEntry.reason.primaryCode);
  assert.ok(routeEntry.explanation.length > 20);
  assert.ok(taskEntry.explanation.length > 20);
});

test("runSlaBreachChecks creates one escalation task and one breach audit trail for a newly overdue lead", async () => {
  const leadId = "acc_meridian_freight_lead_01";
  const referenceTime = new Date("2026-04-02T09:00:00.000Z");
  const breachCheckAt = new Date("2026-04-02T09:20:00.000Z");

  await db.task.deleteMany({
    where: {
      leadId,
      actionType: ActionType.ESCALATE_SLA_BREACH,
    },
  });
  await db.lead.update({
    where: { id: leadId },
    data: {
      firstResponseAt: null,
      slaBreachedAt: null,
      slaStatus: SlaStatus.ON_TRACK,
    },
  });

  await assignSlaForLead(leadId, {
    inboundType: "Inbound",
    temperature: Temperature.HOT,
    triggerSignal: {
      eventType: SignalType.FORM_FILL,
      eventCategory: SignalCategory.CONVERSION,
      receivedAt: referenceTime,
    },
    referenceTime,
  });

  const firstRun = await runSlaBreachChecks(breachCheckAt);
  const secondResult = await runSlaBreachChecks(breachCheckAt);

  const [escalations, audit] = await Promise.all([
    db.task.findMany({
      where: {
        leadId,
        actionType: ActionType.ESCALATE_SLA_BREACH,
      },
      select: {
        id: true,
      },
    }),
    getAuditLogForEntity("lead", leadId, { limit: 25 }),
  ]);

  const recentAudit = [...audit]
    .filter((entry) => new Date(entry.timestampIso).getTime() >= referenceTime.getTime())
    .sort((left, right) => new Date(left.timestampIso).getTime() - new Date(right.timestampIso).getTime());
  const breachEntry = recentAudit.find(
    (entry) => entry.actionCode === "sla_breached" && entry.entity.type === "lead",
  );
  const escalationEntry = recentAudit.find(
    (entry) =>
      entry.actionCode === "task_created" &&
      entry.entity.type === "task" &&
      entry.reason.primaryCode === "sla_breach_requires_escalation",
  );

  assert.ok(firstRun.breachedLeadIds.includes(leadId));
  assert.deepEqual(secondResult.breachedLeadIds, []);
  assert.equal(escalations.length, 1);
  assert.ok(breachEntry);
  assert.ok(escalationEntry);
  assert.equal(breachEntry.reason.primaryCode, "sla_breached_no_response");
  assert.equal(escalationEntry.reason.primaryCode, "sla_breach_requires_escalation");
});
