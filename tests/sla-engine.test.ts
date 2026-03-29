import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { ActionCategory, ActionType, SignalCategory, SignalType, SlaEventType, Temperature } from "@prisma/client";

import { createManualTask } from "@/lib/actions";
import {
  assignSlaForLead,
  assignSlaForTask,
  buildLeadSlaSnapshot,
  buildTaskSlaSnapshot,
  getDashboardSlaSummary,
  getDueSoonThresholdMs,
  getLeadSlaState,
  getTaskSlaState,
  runSlaBreachChecks,
} from "@/lib/sla";
import { db } from "@/lib/db";

import { resetDatabase } from "./helpers/db";

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await resetDatabase();
});

test("assignSlaForTask derives deterministic tracked-task deadlines and target minutes", async () => {
  const taskId = await createManualTask(
    {
      accountId: "acc_meridian_freight",
      leadId: "acc_meridian_freight_lead_01",
      ownerId: "usr_amelia_ross",
      taskType: "CALL",
      priorityCode: "P2",
      dueAtIso: "2026-03-27T18:15:00.000Z",
      title: "Call Meridian Freight",
      description: "Handle the warm inbound follow-up.",
    },
    {
      createdAt: new Date("2026-03-27T18:00:00.000Z"),
    },
  );

  const snapshot = await assignSlaForTask(taskId, {
    isTracked: true,
    policyKey: "sla_hot_inbound_15m",
    policyVersion: "routing/v1",
    dueAt: new Date("2026-03-27T18:15:00.000Z"),
  });
  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    select: {
      isSlaTracked: true,
      slaPolicyKey: true,
      slaPolicyVersion: true,
      slaTargetMinutes: true,
      dueAt: true,
    },
  });

  assert.ok(snapshot);
  assert.equal(task.isSlaTracked, true);
  assert.equal(task.slaPolicyKey, "sla_hot_inbound_15m");
  assert.equal(task.slaPolicyVersion, "routing/v1");
  assert.equal(task.slaTargetMinutes, 15);
  assert.equal(task.dueAt.toISOString(), "2026-03-27T18:15:00.000Z");
});

test("assignSlaForLead derives deterministic policies, deadlines, and immediate states", async () => {
  const cases = [
    {
      leadId: "acc_atlas_grid_lead_01",
      context: {
        inboundType: "Inbound",
        temperature: Temperature.HOT,
        triggerSignal: {
          eventType: SignalType.FORM_FILL,
          eventCategory: SignalCategory.CONVERSION,
          receivedAt: new Date("2026-03-27T18:00:00.000Z"),
        },
        referenceTime: new Date("2026-03-27T18:00:00.000Z"),
      },
      expected: {
        policyKey: "sla_hot_inbound_15m",
        policyVersion: "routing/v1",
        targetMinutes: 15,
        dueAtIso: "2026-03-27T18:15:00.000Z",
        currentState: "on_track",
      },
    },
    {
      leadId: "acc_meridian_freight_lead_01",
      context: {
        inboundType: "Inbound",
        temperature: Temperature.WARM,
        triggerSignal: {
          eventType: SignalType.FORM_FILL,
          eventCategory: SignalCategory.CONVERSION,
          receivedAt: new Date("2026-03-27T19:00:00.000Z"),
        },
        referenceTime: new Date("2026-03-27T19:00:00.000Z"),
      },
      expected: {
        policyKey: "sla_warm_inbound_2h",
        policyVersion: "routing/v1",
        targetMinutes: 120,
        dueAtIso: "2026-03-27T21:00:00.000Z",
        currentState: "on_track",
      },
    },
    {
      leadId: "acc_signalnest_lead_01",
      context: {
        inboundType: "Product-led",
        temperature: Temperature.HOT,
        triggerSignal: {
          eventType: SignalType.PRODUCT_USAGE_MILESTONE,
          eventCategory: SignalCategory.PRODUCT,
          receivedAt: new Date("2026-03-27T20:00:00.000Z"),
        },
        referenceTime: new Date("2026-03-27T20:00:00.000Z"),
      },
      expected: {
        policyKey: "sla_product_qualified_4h",
        policyVersion: "routing/v1",
        targetMinutes: 240,
        dueAtIso: "2026-03-28T00:00:00.000Z",
        currentState: "on_track",
      },
    },
    {
      leadId: "acc_beaconops_lead_01",
      context: {
        inboundType: "Signal-driven",
        temperature: Temperature.COLD,
        triggerSignal: {
          eventType: SignalType.FORM_FILL,
          eventCategory: SignalCategory.CONVERSION,
          receivedAt: new Date("2026-03-27T21:00:00.000Z"),
        },
        referenceTime: new Date("2026-03-27T21:00:00.000Z"),
      },
      expected: {
        policyKey: "sla_general_form_fill_24h",
        policyVersion: "routing/v1",
        targetMinutes: 1440,
        dueAtIso: "2026-03-28T21:00:00.000Z",
        currentState: "on_track",
      },
    },
    {
      leadId: "acc_harborpoint_lead_01",
      context: {
        inboundType: "Outbound",
        temperature: Temperature.COLD,
        triggerSignal: null,
        referenceTime: new Date("2026-03-27T22:00:00.000Z"),
      },
      expected: {
        policyKey: null,
        policyVersion: "routing/v1",
        targetMinutes: null,
        dueAtIso: null,
        currentState: "on_track",
      },
    },
  ] as const;

  for (const scenario of cases) {
    await db.lead.update({
      where: { id: scenario.leadId },
      data: {
        firstResponseAt: null,
        slaBreachedAt: null,
      },
    });

    const snapshot = await assignSlaForLead(scenario.leadId, scenario.context);
    const row = await db.lead.findUniqueOrThrow({
      where: { id: scenario.leadId },
      select: {
        slaPolicyKey: true,
        slaPolicyVersion: true,
        slaTargetMinutes: true,
        slaDeadlineAt: true,
      },
    });

    assert.ok(snapshot);
    assert.equal(snapshot?.policyKey, scenario.expected.policyKey);
    assert.equal(snapshot?.policyVersion, scenario.expected.policyVersion);
    assert.equal(snapshot?.slaTargetMinutes, scenario.expected.targetMinutes);
    assert.equal(snapshot?.dueAtIso, scenario.expected.dueAtIso);
    assert.equal(snapshot?.currentState, scenario.expected.currentState);
    assert.equal(row.slaPolicyKey, scenario.expected.policyKey);
    assert.equal(row.slaPolicyVersion, scenario.expected.policyVersion);
    assert.equal(row.slaTargetMinutes, scenario.expected.targetMinutes);
    assert.equal(row.slaDeadlineAt?.toISOString() ?? null, scenario.expected.dueAtIso);
  }
});

test("seeded SLA scenarios expose deterministic lead and task states", async () => {
  const [atlasLead, meridianLead, signalNestLead, beaconOpsLead, summitFlowLead] =
    await Promise.all([
      getLeadSlaState("acc_atlas_grid_lead_01"),
      getLeadSlaState("acc_meridian_freight_lead_01"),
      getLeadSlaState("acc_signalnest_lead_01"),
      getLeadSlaState("acc_beaconops_lead_01"),
      getLeadSlaState("acc_summitflow_finance_lead_01"),
    ]);

  assert.equal(atlasLead?.currentState, "breached");
  assert.equal(meridianLead?.currentState, "due_soon");
  assert.equal(signalNestLead?.currentState, "on_track");
  assert.equal(beaconOpsLead?.currentState, "overdue");
  assert.equal(summitFlowLead?.currentState, "completed");
  assert.equal(summitFlowLead?.metSla, true);

  const [atlasTaskRow, frontierTaskRow, verityTaskRow, pinecrestTaskRow] =
    await Promise.all([
      db.task.findFirstOrThrow({
        where: { leadId: "acc_atlas_grid_lead_01", isSlaTracked: true },
        select: { id: true },
      }),
      db.task.findFirstOrThrow({
        where: { leadId: "acc_frontier_retail_lead_01", isSlaTracked: true },
        select: { id: true },
      }),
      db.task.findFirstOrThrow({
        where: { leadId: "acc_veritypulse_lead_01", isSlaTracked: true },
        select: { id: true },
      }),
      db.task.findFirstOrThrow({
        where: { leadId: "acc_pinecrest_lead_01", isSlaTracked: true },
        select: { id: true },
      }),
    ]);
  const [atlasTask, frontierTask, verityTask, pinecrestTask] = await Promise.all([
    getTaskSlaState(atlasTaskRow.id),
    getTaskSlaState(frontierTaskRow.id),
    getTaskSlaState(verityTaskRow.id),
    getTaskSlaState(pinecrestTaskRow.id),
  ]);

  assert.equal(atlasTask?.currentState, "breached");
  assert.equal(frontierTask?.currentState, "on_track");
  assert.equal(verityTask?.currentState, "overdue");
  assert.equal(pinecrestTask?.currentState, "completed");
  assert.equal(pinecrestTask?.metSla, true);

  const summary = await getDashboardSlaSummary();
  assert.ok(summary.leadMetrics.openTrackedCount >= 4);
  assert.ok(summary.leadMetrics.dueSoonCount >= 1);
  assert.ok(summary.leadMetrics.breachedCount >= 1);
  assert.ok(summary.taskMetrics.overdueCount >= 1);
  assert.ok(summary.taskMetrics.breachedCount >= 1);
});

test("runSlaBreachChecks is idempotent and does not duplicate escalation tasks", async () => {
  const verityTask = await db.task.findFirstOrThrow({
    where: { leadId: "acc_veritypulse_lead_01", isSlaTracked: true },
    select: { id: true },
  });
  const atlasEscalationsBefore = await db.task.count({
    where: {
      leadId: "acc_atlas_grid_lead_01",
      actionType: ActionType.ESCALATE_SLA_BREACH,
    },
  });
  const verityBreachesBefore = await db.slaEvent.count({
    where: {
      taskId: verityTask.id,
      eventType: SlaEventType.BREACHED,
    },
  });

  await runSlaBreachChecks(new Date());
  await runSlaBreachChecks(new Date());

  const verityTaskAfter = await getTaskSlaState(verityTask.id);
  const atlasEscalationsAfter = await db.task.count({
    where: {
      leadId: "acc_atlas_grid_lead_01",
      actionType: ActionType.ESCALATE_SLA_BREACH,
    },
  });
  const verityBreachesAfter = await db.slaEvent.count({
    where: {
      taskId: verityTask.id,
      eventType: SlaEventType.BREACHED,
    },
  });

  assert.equal(verityTaskAfter?.currentState, "breached");
  assert.equal(verityBreachesAfter, verityBreachesBefore + 1);
  assert.equal(atlasEscalationsAfter, atlasEscalationsBefore);
});

test("primary response tracking stays singular for the Atlas hot inbound cycle", async () => {
  const atlasImmediateTasks = await db.task.findMany({
    where: {
      leadId: "acc_atlas_grid_lead_01",
      actionCategory: ActionCategory.IMMEDIATE_RESPONSE,
    },
    select: {
      actionType: true,
      isSlaTracked: true,
    },
  });

  assert.ok(atlasImmediateTasks.length >= 2);
  assert.equal(atlasImmediateTasks.filter((task) => task.isSlaTracked).length, 1);
  assert.equal(
    atlasImmediateTasks.find((task) => task.isSlaTracked)?.actionType,
    ActionType.CALL_WITHIN_15_MINUTES,
  );
});

test("due soon thresholds and met-SLA snapshots remain deterministic", () => {
  assert.equal(getDueSoonThresholdMs(15, true), 5 * 60 * 1000);
  assert.equal(getDueSoonThresholdMs(120, true), 30 * 60 * 1000);
  assert.equal(getDueSoonThresholdMs(1440, true), 120 * 60 * 1000);
  assert.equal(getDueSoonThresholdMs(null, false), 60 * 60 * 1000);

  const completedLead = buildLeadSlaSnapshot({
    isTracked: true,
    policyKey: "sla_hot_inbound_15m",
    policyVersion: "routing/v1",
    targetMinutes: 15,
    dueAt: new Date("2026-03-28T18:15:00.000Z"),
    breachedAt: null,
    firstResponseAt: new Date("2026-03-28T18:10:00.000Z"),
    routedAt: new Date("2026-03-28T18:00:00.000Z"),
    now: new Date("2026-03-28T18:20:00.000Z"),
  });
  const lateLead = buildLeadSlaSnapshot({
    isTracked: true,
    policyKey: "sla_hot_inbound_15m",
    policyVersion: "routing/v1",
    targetMinutes: 15,
    dueAt: new Date("2026-03-28T18:15:00.000Z"),
    breachedAt: new Date("2026-03-28T18:16:00.000Z"),
    firstResponseAt: new Date("2026-03-28T18:25:00.000Z"),
    routedAt: new Date("2026-03-28T18:00:00.000Z"),
    now: new Date("2026-03-28T18:30:00.000Z"),
  });

  assert.equal(completedLead.currentState, "completed");
  assert.equal(completedLead.metSla, true);
  assert.equal(lateLead.currentState, "completed");
  assert.equal(lateLead.metSla, false);
});

test("SLA snapshot builders cover on-track, due-soon, overdue, breached, and completed states", () => {
  const onTrack = buildLeadSlaSnapshot({
    isTracked: true,
    policyKey: "sla_warm_inbound_2h",
    policyVersion: "routing/v1",
    targetMinutes: 120,
    dueAt: new Date("2026-03-27T20:00:00.000Z"),
    breachedAt: null,
    firstResponseAt: null,
    routedAt: new Date("2026-03-27T18:00:00.000Z"),
    now: new Date("2026-03-27T18:30:00.000Z"),
  });
  const dueSoon = buildLeadSlaSnapshot({
    isTracked: true,
    policyKey: "sla_hot_inbound_15m",
    policyVersion: "routing/v1",
    targetMinutes: 15,
    dueAt: new Date("2026-03-27T18:15:00.000Z"),
    breachedAt: null,
    firstResponseAt: null,
    routedAt: new Date("2026-03-27T18:00:00.000Z"),
    now: new Date("2026-03-27T18:10:00.000Z"),
  });
  const overdue = buildLeadSlaSnapshot({
    isTracked: true,
    policyKey: "sla_hot_inbound_15m",
    policyVersion: "routing/v1",
    targetMinutes: 15,
    dueAt: new Date("2026-03-27T18:15:00.000Z"),
    breachedAt: null,
    firstResponseAt: null,
    routedAt: new Date("2026-03-27T18:00:00.000Z"),
    now: new Date("2026-03-27T18:16:00.000Z"),
  });
  const breached = buildTaskSlaSnapshot({
    isTracked: true,
    policyKey: "sla_hot_inbound_15m",
    policyVersion: "routing/v1",
    targetMinutes: 15,
    dueAt: new Date("2026-03-27T18:15:00.000Z"),
    breachedAt: new Date("2026-03-27T18:16:00.000Z"),
    completedAt: null,
    now: new Date("2026-03-27T18:20:00.000Z"),
  });
  const completed = buildTaskSlaSnapshot({
    isTracked: true,
    policyKey: "sla_hot_inbound_15m",
    policyVersion: "routing/v1",
    targetMinutes: 15,
    dueAt: new Date("2026-03-27T18:15:00.000Z"),
    breachedAt: null,
    completedAt: new Date("2026-03-27T18:12:00.000Z"),
    now: new Date("2026-03-27T18:20:00.000Z"),
  });

  assert.equal(onTrack.currentState, "on_track");
  assert.equal(dueSoon.currentState, "due_soon");
  assert.equal(overdue.currentState, "overdue");
  assert.equal(breached.currentState, "breached");
  assert.equal(completed.currentState, "completed");
  assert.equal(completed.metSla, true);
});
