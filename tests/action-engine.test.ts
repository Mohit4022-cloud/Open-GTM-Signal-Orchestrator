import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import {
  ActionType,
  SignalCategory,
  SignalType,
  TaskPriority,
} from "@prisma/client";

import {
  createLeadSlaEscalationTaskWithClient,
  createManualTask,
  generateActionsForLead,
  getActionRecommendationsForEntity,
  getTasksForAccount,
  getTasksForLead,
} from "@/lib/actions";
import { evaluateAccountActionRules, evaluateLeadActionRules } from "@/lib/actions/rules";
import { db } from "@/lib/db";

import { resetDatabase } from "./helpers/db";

before(async () => {
  await resetDatabase();
});

after(async () => {
  await resetDatabase();
});

function buildLeadRuleContext(
  overrides: Partial<Parameters<typeof evaluateLeadActionRules>[0]> = {},
  templateContextOverrides: Partial<Parameters<typeof evaluateLeadActionRules>[0]["templateContext"]> = {},
): Parameters<typeof evaluateLeadActionRules>[0] {
  return {
    templateContext: {
      entityType: "lead",
      entityId: "lead_unit_01",
      accountId: "acc_unit_01",
      leadId: "lead_unit_01",
      accountName: "Unit Account",
      leadLabel: "Pat Doe",
      contactId: "contact_unit_01",
      contactName: "Pat Doe",
      temperature: "HOT",
      inboundType: "Inbound",
      lifecycleStage: "ENGAGED",
      assignedQueue: "na-west-smb",
      isStrategic: false,
      activeAccount: false,
      triggerSignalId: "sig_unit_01",
      triggerRoutingDecisionId: "route_unit_01",
      triggerScoreHistoryId: "score_unit_01",
      ...templateContextOverrides,
    },
    accountName: "Unit Account",
    contactName: "Pat Doe",
    contactPhone: "555-0100",
    leadTemperature: "HOT",
    inboundType: "Inbound",
    triggerSignal: {
      id: "sig_unit_01",
      eventType: SignalType.FORM_FILL,
      eventCategory: SignalCategory.CONVERSION,
      receivedAt: new Date("2026-03-27T18:00:00.000Z"),
      rawReference: {
        form_id: "request_demo",
      },
    },
    routingDecision: {
      id: "route_unit_01",
      assignedOwnerId: "usr_owen_price",
      secondaryOwnerId: "usr_dante_kim",
      assignedQueue: "na-west-smb",
      slaDueAt: new Date("2026-03-27T18:15:00.000Z"),
    },
    scoreHistoryId: "score_unit_01",
    callOwnerId: "usr_owen_price",
    aeOwnerId: "usr_dante_kim",
    hasActiveAccountPause: false,
    firstResponseAt: null,
    now: new Date("2026-03-27T18:00:00.000Z"),
    ...overrides,
  };
}

function buildAccountRuleContext(
  overrides: Partial<Parameters<typeof evaluateAccountActionRules>[0]> = {},
  templateContextOverrides: Partial<Parameters<typeof evaluateAccountActionRules>[0]["templateContext"]> = {},
): Parameters<typeof evaluateAccountActionRules>[0] {
  return {
    templateContext: {
      entityType: "account",
      entityId: "acc_unit_01",
      accountId: "acc_unit_01",
      leadId: null,
      accountName: "Unit Account",
      leadLabel: null,
      contactId: null,
      contactName: null,
      temperature: "WARM",
      inboundType: null,
      lifecycleStage: "ENGAGED",
      assignedQueue: null,
      isStrategic: false,
      activeAccount: false,
      triggerSignalId: "sig_unit_02",
      triggerRoutingDecisionId: null,
      triggerScoreHistoryId: "score_unit_02",
      ...templateContextOverrides,
    },
    accountName: "Unit Account",
    accountOwnerId: "usr_amelia_ross",
    triggerSignal: {
      id: "sig_unit_02",
      eventType: SignalType.PRICING_PAGE_VISIT,
      eventCategory: SignalCategory.WEB_ACTIVITY,
      receivedAt: new Date("2026-03-27T18:00:00.000Z"),
    },
    latestScoreReasonCodes: [],
    hasRecentFormFill: false,
    isWarmAccount: true,
    hasActiveAccountPause: false,
    now: new Date("2026-03-27T18:00:00.000Z"),
    ...overrides,
  };
}

test("evaluateLeadActionRules selects request-demo, enrichment, and handoff templates with stable priorities", () => {
  const evaluation = evaluateLeadActionRules(
    buildLeadRuleContext(
      {
        contactPhone: null,
        leadTemperature: "URGENT",
      },
      {
        isStrategic: true,
        temperature: "URGENT",
      },
    ),
  );

  const callTask = evaluation.tasks.find((task) => task.actionType === ActionType.CALL_WITHIN_15_MINUTES);
  const emailTask = evaluation.tasks.find((task) => task.actionType === ActionType.SEND_FOLLOW_UP_EMAIL);
  const handoffTask = evaluation.tasks.find((task) => task.actionType === ActionType.HANDOFF_TO_AE);
  const enrichTask = evaluation.tasks.find((task) => task.actionType === ActionType.ENRICH_MISSING_CONTACT_FIELDS);

  assert.ok(callTask);
  assert.ok(emailTask);
  assert.ok(handoffTask);
  assert.ok(enrichTask);
  assert.equal(callTask.priority, TaskPriority.URGENT);
  assert.equal(emailTask.priority, TaskPriority.HIGH);
  assert.equal(handoffTask.priority, TaskPriority.HIGH);
  assert.equal(enrichTask.priority, TaskPriority.HIGH);
  assert.equal(callTask.dueAt.toISOString(), "2026-03-27T18:15:00.000Z");
});

test("evaluateLeadActionRules falls back to enrichment-only for non-demo signals", () => {
  const evaluation = evaluateLeadActionRules(
    buildLeadRuleContext({
      contactPhone: null,
      triggerSignal: {
        id: "sig_unit_03",
        eventType: SignalType.WEBSITE_VISIT,
        eventCategory: SignalCategory.WEB_ACTIVITY,
        receivedAt: new Date("2026-03-27T18:00:00.000Z"),
        rawReference: {
          page: "/pricing",
        },
      },
    }),
  );

  assert.deepEqual(
    evaluation.tasks.map((task) => task.actionType),
    [ActionType.ENRICH_MISSING_CONTACT_FIELDS],
  );
  assert.deepEqual(evaluation.skippedReasonCodes, []);
});

test("evaluateAccountActionRules covers research, pause, and product-qualified handoff branches", () => {
  const warmPricing = evaluateAccountActionRules(buildAccountRuleContext());
  const pausedPricing = evaluateAccountActionRules(
    buildAccountRuleContext({
      hasActiveAccountPause: true,
    }, {
      activeAccount: true,
    }),
  );
  const productQualified = evaluateAccountActionRules(
    buildAccountRuleContext({
      triggerSignal: {
        id: "sig_unit_04",
        eventType: SignalType.PRODUCT_USAGE_MILESTONE,
        eventCategory: SignalCategory.PRODUCT,
        receivedAt: new Date("2026-03-27T18:00:00.000Z"),
      },
      latestScoreReasonCodes: ["product_usage_key_activation"],
      isWarmAccount: false,
    }),
  );

  assert.equal(
    warmPricing.tasks.find((task) => task.actionType === ActionType.RESEARCH_ACCOUNT)?.priority,
    TaskPriority.HIGH,
  );
  assert.equal(
    warmPricing.recommendations.find(
      (recommendation) => recommendation.recommendationType === ActionType.ADD_TO_NURTURE_QUEUE,
    )?.severity,
    TaskPriority.MEDIUM,
  );
  assert.equal(
    pausedPricing.recommendations.find(
      (recommendation) => recommendation.recommendationType === ActionType.PAUSE_ACTIVE_ACCOUNT,
    )?.severity,
    TaskPriority.LOW,
  );
  assert.deepEqual(pausedPricing.skippedReasonCodes, ["active_account_pause_recommended"]);
  assert.equal(
    productQualified.tasks.find((task) => task.actionType === ActionType.HANDOFF_TO_AE)?.priority,
    TaskPriority.HIGH,
  );
  assert.ok(
    productQualified.recommendations.some(
      (recommendation) => recommendation.recommendationType === ActionType.GENERATE_ACCOUNT_SUMMARY,
    ),
  );
});

test("manual and escalation task creation preserve expected priorities", async () => {
  const manualTaskId = await createManualTask({
    accountId: "acc_meridian_freight",
    ownerId: "usr_amelia_ross",
    taskType: "REVIEW",
    priorityCode: "P4",
    dueAtIso: "2026-03-30T18:00:00.000Z",
    title: "Review Meridian renewal path",
    description: "Confirm the renewal stakeholder map and capture expansion blockers.",
  });

  const escalation = await db.$transaction((client) =>
    createLeadSlaEscalationTaskWithClient(client, {
      leadId: "acc_meridian_freight_lead_01",
      accountId: "acc_meridian_freight",
      ownerId: "usr_amelia_ross",
      accountName: "Meridian Freight Cloud",
      dueAt: new Date("2026-03-30T18:15:00.000Z"),
      breachedAt: new Date("2026-03-30T18:20:00.000Z"),
      routingDecisionId: "route_unit_escalation",
    }),
  );

  const [manualTask, escalationTask] = await Promise.all([
    db.task.findUniqueOrThrow({
      where: { id: manualTaskId },
      select: { priority: true },
    }),
    db.task.findUniqueOrThrow({
      where: { id: escalation.id },
      select: { priority: true },
    }),
  ]);

  assert.equal(manualTask.priority, TaskPriority.LOW);
  assert.equal(escalationTask.priority, TaskPriority.URGENT);
});

test("seeded action engine scenarios create deterministic lead and account tasks", async () => {
  const [atlasLeadTasks, beaconOpsTasks, signalNestTasks, beaconOpsRecommendations] =
    await Promise.all([
      getTasksForLead("acc_atlas_grid_lead_01"),
      getTasksForAccount("acc_beaconops"),
      getTasksForAccount("acc_signalnest"),
      getActionRecommendationsForEntity("account", "acc_beaconops"),
    ]);

  assert.ok(
    atlasLeadTasks.some((task) => task.actionType === ActionType.CALL_WITHIN_15_MINUTES),
  );
  assert.ok(
    atlasLeadTasks.some((task) => task.actionType === ActionType.SEND_FOLLOW_UP_EMAIL),
  );
  assert.ok(
    atlasLeadTasks.some((task) => task.actionType === ActionType.HANDOFF_TO_AE),
  );
  assert.ok(
    atlasLeadTasks.some((task) => task.actionType === ActionType.ENRICH_MISSING_CONTACT_FIELDS),
  );
  assert.ok(
    atlasLeadTasks.some((task) => task.actionType === ActionType.ESCALATE_SLA_BREACH),
  );

  assert.ok(
    beaconOpsTasks.some((task) => task.actionType === ActionType.RESEARCH_ACCOUNT),
  );
  assert.ok(
    signalNestTasks.some((task) => task.actionType === ActionType.HANDOFF_TO_AE),
  );
  assert.ok(
    beaconOpsRecommendations.some(
      (recommendation) => recommendation.recommendationType === ActionType.ADD_TO_NURTURE_QUEUE,
    ),
  );
});

test("rerunning generation for the same Atlas demo signal prevents duplicate urgent call tasks", async () => {
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
  const callTasksBefore = (await getTasksForLead("acc_atlas_grid_lead_01")).filter(
    (task) => task.actionType === ActionType.CALL_WITHIN_15_MINUTES,
  );

  const rerun = await generateActionsForLead("acc_atlas_grid_lead_01", {
    effectiveAt: atlasDemoSignal.receivedAt,
    triggerSignalId: atlasDemoSignal.id,
  });

  const callTasksAfter = (await getTasksForLead("acc_atlas_grid_lead_01")).filter(
    (task) => task.actionType === ActionType.CALL_WITHIN_15_MINUTES,
  );

  assert.ok(rerun);
  assert.ok(rerun.preventedDuplicateKeys.length > 0);
  assert.equal(callTasksAfter.length, callTasksBefore.length);
});
