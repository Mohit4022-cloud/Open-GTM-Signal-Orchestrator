import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import {
  AccountTier,
  Geography,
  Segment,
  SignalCategory,
  SignalStatus,
  SignalType,
  Temperature,
} from "@prisma/client";

import type {
  RoutingCapacitySnapshotContract,
  RoutingOwnerSummaryContract,
} from "@/lib/contracts/routing";
import { ingestSignal } from "@/lib/data/signals";
import { db } from "@/lib/db";
import { getRoutingDecisionsForEntity, routeAccount, routeLead, simulateRouting } from "@/lib/routing";
import { routingConfigSchemaForTests } from "@/lib/routing/config";
import {
  evaluateRoutingDecision,
  type RoutingEvaluationContext,
  type RoutingEvaluationDeps,
} from "@/lib/routing/engine";
import { resolveRoutingSla } from "@/lib/routing/sla";

import { resetDatabase } from "./helpers/db";

before(async () => {
  await resetDatabase();
});

after(async () => {
  await resetDatabase();
});

const ownerSummaries: Record<string, RoutingOwnerSummaryContract> = {
  usr_dante_kim: {
    id: "usr_dante_kim",
    name: "Dante Kim",
    role: "Account Executive",
    team: "North America West",
    geography: Geography.NA_WEST,
  },
  usr_owen_price: {
    id: "usr_owen_price",
    name: "Owen Price",
    role: "SDR",
    team: "NA West Mid-Market",
    geography: Geography.NA_WEST,
  },
  usr_miles_turner: {
    id: "usr_miles_turner",
    name: "Miles Turner",
    role: "SDR",
    team: "North America West",
    geography: Geography.NA_WEST,
  },
  usr_elena_morales: {
    id: "usr_elena_morales",
    name: "Elena Morales",
    role: "Strategic AE",
    team: "Strategic Accounts",
    geography: Geography.NA_EAST,
  },
  usr_sarah_kim: {
    id: "usr_sarah_kim",
    name: "Sarah Kim",
    role: "SDR",
    team: "NA East Mid-Market",
    geography: Geography.NA_EAST,
  },
  usr_ivy_ng: {
    id: "usr_ivy_ng",
    name: "Ivy Ng",
    role: "SDR",
    team: "APAC Commercial",
    geography: Geography.APAC,
  },
};

const unitRoutingConfig = routingConfigSchemaForTests.parse({
  version: "routing/test",
  precedence: [
    "named_account_owner",
    "existing_account_owner",
    "strategic_tier_override",
    "territory_segment_rule",
    "round_robin_pool",
    "ops_review_queue",
  ],
  territorySegmentRules: [
    {
      key: "na-west-smb",
      geography: Geography.NA_WEST,
      segment: Segment.SMB,
      team: "NA West Commercial",
      queue: "na-west-smb",
      poolKey: "pool-na-west-commercial",
      inboundTypes: [],
      sdrPod: "NA-West",
    },
  ],
  roundRobinPools: [
    {
      key: "pool-na-west-commercial",
      geography: Geography.NA_WEST,
      team: "NA West Commercial",
      queue: "na-west-smb",
      members: ["usr_owen_price", "usr_miles_turner"],
      backupPoolKey: "pool-na-west-fallback",
      sdrPod: "NA-West",
    },
    {
      key: "pool-na-west-fallback",
      geography: Geography.NA_WEST,
      team: "NA West Review",
      queue: "na-west-review",
      members: ["usr_owen_price", "usr_miles_turner"],
      sdrPod: "NA-West",
    },
    {
      key: "pool-apac-fallback",
      geography: Geography.APAC,
      team: "APAC Review",
      queue: "apac-review",
      members: ["usr_ivy_ng"],
      sdrPod: "APAC",
    },
  ],
  fallbackPoolKeys: {
    [Geography.NA_EAST]: "pool-na-west-fallback",
    [Geography.EMEA]: "pool-na-west-fallback",
    [Geography.NA_WEST]: "pool-na-west-fallback",
    [Geography.APAC]: "pool-apac-fallback",
  },
  strategicOverrides: [
    {
      key: "strategic-override",
      accountTier: AccountTier.STRATEGIC,
      team: "Strategic Accounts",
      queue: "strategic-accounts",
      primaryOwnerId: "usr_elena_morales",
      secondaryOwnerId: "usr_sarah_kim",
      escalationPolicyKey: "strategic-ae-sdr-pair",
    },
  ],
  opsReview: {
    team: "Revenue Operations",
    queue: "ops-review",
  },
  slaPolicy: {
    hotInboundLeadMinutes: 15,
    warmInboundLeadMinutes: 120,
    productQualifiedMinutes: 240,
    generalFormFillMinutes: 1440,
  },
});

function buildCapacitySnapshot(
  ownerId: string,
  hasCapacity: boolean,
): RoutingCapacitySnapshotContract {
  const owner = ownerSummaries[ownerId];

  return {
    ownerId,
    ownerName: owner?.name ?? ownerId,
    role: owner?.role ?? "SDR",
    team: owner?.team ?? "Unknown",
    openHotLeads: hasCapacity ? 1 : 9,
    maxOpenHotLeads: 6,
    dailyInboundAssignments: hasCapacity ? 1 : 9,
    maxDailyInboundAssignments: 8,
    openTaskCount: hasCapacity ? 2 : 16,
    maxOpenTasks: 10,
    hasCapacity,
    blockingChecks: hasCapacity ? [] : ["open_hot_leads", "daily_inbound_assignments"],
  };
}

function buildRoutingContext(
  overrides: Partial<RoutingEvaluationContext> = {},
): RoutingEvaluationContext {
  return {
    entityType: "lead",
    entityId: "lead_test_01",
    accountId: "acc_test_01",
    leadId: "lead_test_01",
    accountDomain: "example.com",
    geography: Geography.NA_WEST,
    segment: Segment.SMB,
    accountTier: AccountTier.TIER_3,
    namedOwnerId: null,
    existingOwnerId: null,
    leadSource: "Pricing page revisit",
    inboundType: "Inbound",
    sdrPod: null,
    temperature: Temperature.HOT,
    triggerSignal: null,
    referenceTime: new Date("2026-03-27T18:00:00.000Z"),
    ...overrides,
  };
}

function createRoutingDeps(options: {
  ownerCapacities?: Record<string, boolean>;
  poolSelections?: Record<
    string,
    {
      selectedOwnerId: string | null;
      candidateOwnerIds?: string[];
      capacityByOwner?: Record<string, boolean>;
    }
  >;
} = {}): RoutingEvaluationDeps {
  return {
    async getOwnerSummary(ownerId) {
      return ownerSummaries[ownerId] ?? null;
    },
    async getCapacitySnapshot(ownerId) {
      return buildCapacitySnapshot(ownerId, options.ownerCapacities?.[ownerId] ?? true);
    },
    async selectRoundRobinCandidate(pool) {
      const selection = options.poolSelections?.[pool.key];
      const candidateOwnerIds = selection?.candidateOwnerIds ?? [...pool.members];
      const capacityChecks = candidateOwnerIds.map((ownerId) =>
        buildCapacitySnapshot(
          ownerId,
          selection?.capacityByOwner?.[ownerId] ??
            options.ownerCapacities?.[ownerId] ??
            true,
        ),
      );

      return {
        selectedOwnerId:
          selection?.selectedOwnerId !== undefined
            ? selection.selectedOwnerId
            : capacityChecks.find((snapshot) => snapshot.hasCapacity)?.ownerId ?? null,
        candidateOwnerIds,
        capacityChecks,
      };
    },
  };
}

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

test("evaluateRoutingDecision applies routing precedence deterministically", async () => {
  const deps = createRoutingDeps();

  const namedDecision = await evaluateRoutingDecision(
    unitRoutingConfig,
    buildRoutingContext({
      namedOwnerId: "usr_dante_kim",
      existingOwnerId: "usr_owen_price",
      accountTier: AccountTier.STRATEGIC,
    }),
    deps,
  );
  const existingDecision = await evaluateRoutingDecision(
    unitRoutingConfig,
    buildRoutingContext({
      existingOwnerId: "usr_owen_price",
      accountTier: AccountTier.STRATEGIC,
    }),
    deps,
  );
  const strategicDecision = await evaluateRoutingDecision(
    unitRoutingConfig,
    buildRoutingContext({
      accountTier: AccountTier.STRATEGIC,
    }),
    deps,
  );
  const territoryDecision = await evaluateRoutingDecision(
    unitRoutingConfig,
    buildRoutingContext({
      accountTier: AccountTier.TIER_3,
      segment: Segment.SMB,
      geography: Geography.NA_WEST,
    }),
    deps,
  );
  const fallbackDecision = await evaluateRoutingDecision(
    unitRoutingConfig,
    buildRoutingContext({
      geography: Geography.APAC,
      segment: Segment.MID_MARKET,
      accountTier: AccountTier.TIER_2,
    }),
    createRoutingDeps({
      poolSelections: {
        "pool-apac-fallback": {
          selectedOwnerId: "usr_ivy_ng",
        },
      },
    }),
  );
  const opsReviewDecision = await evaluateRoutingDecision(
    unitRoutingConfig,
    buildRoutingContext({
      geography: Geography.APAC,
      segment: Segment.MID_MARKET,
      accountTier: AccountTier.TIER_2,
    }),
    createRoutingDeps({
      poolSelections: {
        "pool-apac-fallback": {
          selectedOwnerId: null,
          capacityByOwner: {
            usr_ivy_ng: false,
          },
        },
      },
    }),
  );

  assert.equal(namedDecision.decisionType, "named_account_owner");
  assert.equal(existingDecision.decisionType, "existing_account_owner");
  assert.equal(strategicDecision.decisionType, "strategic_tier_override");
  assert.equal(territoryDecision.decisionType, "territory_segment_rule");
  assert.equal(fallbackDecision.decisionType, "round_robin_pool");
  assert.equal(opsReviewDecision.decisionType, "ops_review_queue");
});

test("routing precedence branches return the expected owner, queue, and reason traces", async () => {
  const cases = [
    {
      name: "named account owner",
      context: buildRoutingContext({
        namedOwnerId: "usr_dante_kim",
        existingOwnerId: "usr_owen_price",
      }),
      deps: createRoutingDeps(),
      expectedDecisionType: "named_account_owner",
      expectedOwnerId: "usr_dante_kim",
      expectedQueue: "na-west-smb",
      expectedReasonCodes: ["account_is_named", "sla_hot_inbound_15m"],
      expectedSelectedStepCodes: ["account_is_named", "owner_has_capacity"],
      expectedFallbackStepCodes: null,
    },
    {
      name: "existing owner after named-owner fallback",
      context: buildRoutingContext({
        namedOwnerId: "usr_dante_kim",
        existingOwnerId: "usr_owen_price",
      }),
      deps: createRoutingDeps({
        ownerCapacities: {
          usr_dante_kim: false,
          usr_owen_price: true,
        },
      }),
      expectedDecisionType: "existing_account_owner",
      expectedOwnerId: "usr_owen_price",
      expectedQueue: "na-west-smb",
      expectedReasonCodes: [
        "existing_owner_preserved",
        "fallback_after_capacity",
        "sla_hot_inbound_15m",
      ],
      expectedSelectedStepCodes: ["existing_owner_preserved", "owner_has_capacity"],
      expectedFallbackStepCodes: ["account_is_named", "owner_over_capacity"],
    },
    {
      name: "strategic override",
      context: buildRoutingContext({
        accountTier: AccountTier.STRATEGIC,
        segment: Segment.STRATEGIC,
      }),
      deps: createRoutingDeps(),
      expectedDecisionType: "strategic_tier_override",
      expectedOwnerId: "usr_elena_morales",
      expectedQueue: "strategic-accounts",
      expectedReasonCodes: ["strategic_tier_override", "sla_hot_inbound_15m"],
      expectedSelectedStepCodes: [
        "strategic_tier_override",
        "strategic_pair_assigned",
        "owner_has_capacity",
      ],
      expectedFallbackStepCodes: null,
    },
    {
      name: "territory segment rule",
      context: buildRoutingContext({
        geography: Geography.NA_WEST,
        segment: Segment.SMB,
        accountTier: AccountTier.TIER_3,
      }),
      deps: createRoutingDeps(),
      expectedDecisionType: "territory_segment_rule",
      expectedOwnerId: "usr_owen_price",
      expectedQueue: "na-west-smb",
      expectedReasonCodes: ["territory_segment_match", "sla_hot_inbound_15m"],
      expectedSelectedStepCodes: [
        "territory_segment_match",
        "round_robin_selected",
        "owner_has_capacity",
      ],
      expectedFallbackStepCodes: null,
    },
    {
      name: "fallback round robin",
      context: buildRoutingContext({
        geography: Geography.APAC,
        segment: Segment.MID_MARKET,
        accountTier: AccountTier.TIER_2,
      }),
      deps: createRoutingDeps({
        poolSelections: {
          "pool-apac-fallback": {
            selectedOwnerId: "usr_ivy_ng",
          },
        },
      }),
      expectedDecisionType: "round_robin_pool",
      expectedOwnerId: "usr_ivy_ng",
      expectedQueue: "apac-review",
      expectedReasonCodes: ["sla_hot_inbound_15m"],
      expectedSelectedStepCodes: ["round_robin_selected", "owner_has_capacity"],
      expectedFallbackStepCodes: null,
    },
    {
      name: "ops review",
      context: buildRoutingContext({
        geography: Geography.APAC,
        segment: Segment.MID_MARKET,
        accountTier: AccountTier.TIER_2,
        temperature: Temperature.WARM,
      }),
      deps: createRoutingDeps({
        poolSelections: {
          "pool-apac-fallback": {
            selectedOwnerId: null,
            capacityByOwner: {
              usr_ivy_ng: false,
            },
          },
        },
      }),
      expectedDecisionType: "ops_review_queue",
      expectedOwnerId: null,
      expectedQueue: "ops-review",
      expectedReasonCodes: [
        "sent_to_ops_review",
        "fallback_after_capacity",
        "sla_warm_inbound_2h",
      ],
      expectedSelectedStepCodes: ["no_eligible_owner_found", "sent_to_ops_review"],
      expectedFallbackStepCodes: null,
    },
  ] as const;

  for (const scenario of cases) {
    const decision = await evaluateRoutingDecision(
      unitRoutingConfig,
      scenario.context,
      scenario.deps,
    );
    const selectedStep = decision.explanation.evaluatedPolicies.find((step) => step.selected);

    assert.equal(decision.decisionType, scenario.expectedDecisionType, scenario.name);
    assert.equal(decision.assignedOwner?.id ?? null, scenario.expectedOwnerId, scenario.name);
    assert.equal(decision.assignedQueue, scenario.expectedQueue, scenario.name);
    assert.deepEqual(decision.reasonCodes, scenario.expectedReasonCodes, scenario.name);
    assert.deepEqual(selectedStep?.reasonCodes, scenario.expectedSelectedStepCodes, scenario.name);

    if (scenario.expectedFallbackStepCodes) {
      assert.deepEqual(
        decision.explanation.evaluatedPolicies[0]?.reasonCodes,
        scenario.expectedFallbackStepCodes,
        scenario.name,
      );
    }
  }
});

test("capacity fallback keeps top-level routing reasons concise and step diagnostics verbose", async () => {
  const decision = await evaluateRoutingDecision(
    unitRoutingConfig,
    buildRoutingContext({
      namedOwnerId: "usr_dante_kim",
      existingOwnerId: "usr_owen_price",
    }),
    createRoutingDeps({
      ownerCapacities: {
        usr_dante_kim: false,
        usr_owen_price: true,
      },
    }),
  );

  assert.equal(decision.decisionType, "existing_account_owner");
  assert.deepEqual(decision.reasonCodes, [
    "existing_owner_preserved",
    "fallback_after_capacity",
    "sla_hot_inbound_15m",
  ]);
  assert.deepEqual(
    decision.explanation.reasonDetails.map((detail) => detail.code),
    decision.reasonCodes,
  );
  assert.ok(!decision.reasonCodes.includes("owner_has_capacity"));
  assert.ok(!decision.reasonCodes.includes("owner_over_capacity"));
  assert.equal(decision.explanation.capacity.fallbackTriggered, true);
  assert.ok(
    decision.explanation.evaluatedPolicies[0]?.reasonCodes.includes("owner_over_capacity"),
  );
  assert.ok(
    decision.explanation.evaluatedPolicies[0]?.reasonDetails.some(
      (detail) => detail.code === "owner_over_capacity",
    ),
  );
  assert.ok(
    decision.explanation.evaluatedPolicies[1]?.reasonCodes.includes("owner_has_capacity"),
  );
  assert.ok(
    decision.explanation.evaluatedPolicies[1]?.reasonDetails.some(
      (detail) => detail.code === "owner_has_capacity",
    ),
  );
  assert.deepEqual(
    decision.explanation.sla.reasonDetails.map((detail) => detail.code),
    ["sla_hot_inbound_15m"],
  );
});

test("resolveRoutingSla assigns deterministic deadlines from trigger signals and reference time", () => {
  const referenceTime = new Date("2026-03-27T18:00:00.000Z");
  const triggerReceivedAt = new Date("2026-03-27T18:02:00.000Z");

  const urgentInbound = resolveRoutingSla(unitRoutingConfig, {
    entityType: "lead",
    inboundType: "Inbound",
    temperature: Temperature.URGENT,
    triggerSignal: {
      eventType: SignalType.PRODUCT_USAGE_MILESTONE,
      eventCategory: SignalCategory.PRODUCT,
      receivedAt: triggerReceivedAt,
    },
    referenceTime,
  });
  const warmInbound = resolveRoutingSla(unitRoutingConfig, {
    entityType: "lead",
    inboundType: "Inbound",
    temperature: Temperature.WARM,
    triggerSignal: null,
    referenceTime,
  });
  const productQualified = resolveRoutingSla(unitRoutingConfig, {
    entityType: "lead",
    inboundType: "Product-led",
    temperature: Temperature.HOT,
    triggerSignal: null,
    referenceTime,
  });
  const generalFormFill = resolveRoutingSla(unitRoutingConfig, {
    entityType: "lead",
    inboundType: "Signal-driven",
    temperature: Temperature.WARM,
    triggerSignal: {
      eventType: SignalType.FORM_FILL,
      eventCategory: SignalCategory.CONVERSION,
      receivedAt: triggerReceivedAt,
    },
    referenceTime,
  });
  const noSla = resolveRoutingSla(unitRoutingConfig, {
    entityType: "account",
    inboundType: null,
    temperature: Temperature.COLD,
    triggerSignal: null,
    referenceTime,
  });

  assert.equal(urgentInbound.targetMinutes, 15);
  assert.equal(urgentInbound.dueAt?.toISOString(), "2026-03-27T18:17:00.000Z");
  assert.deepEqual(urgentInbound.reasonCodes, ["sla_hot_inbound_15m"]);

  assert.equal(warmInbound.targetMinutes, 120);
  assert.equal(warmInbound.dueAt?.toISOString(), "2026-03-27T20:00:00.000Z");
  assert.deepEqual(warmInbound.reasonCodes, ["sla_warm_inbound_2h"]);

  assert.equal(productQualified.targetMinutes, 240);
  assert.equal(productQualified.dueAt?.toISOString(), "2026-03-27T22:00:00.000Z");
  assert.deepEqual(productQualified.reasonCodes, ["sla_product_qualified_4h"]);

  assert.equal(generalFormFill.targetMinutes, 1440);
  assert.equal(generalFormFill.dueAt?.toISOString(), "2026-03-28T18:02:00.000Z");
  assert.deepEqual(generalFormFill.reasonCodes, ["sla_general_form_fill_24h"]);

  assert.equal(noSla.targetMinutes, null);
  assert.equal(noSla.dueAt, null);
  assert.deepEqual(noSla.reasonCodes, []);
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
  assert.ok(!rerouted.reasonCodes.includes("owner_has_capacity"));
  assert.deepEqual(
    rerouted.reasonDetails.map((detail) => detail.code),
    rerouted.reasonCodes,
  );
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

test("matched signal reroutes an urgent lead and persists a normalized routing decision", async () => {
  const beforeCount = await db.routingDecision.count({
    where: {
      leadId: "acc_harborpoint_lead_01",
    },
  });
  const signal = await ingestSignal({
    source_system: "product",
    event_type: "product_usage_milestone",
    account_domain: "harborpointsaas.com",
    contact_email: "zara.grant@harborpointsaas.com",
    occurred_at: "2026-03-27T18:00:00.000Z",
    received_at: "2026-03-27T18:02:00.000Z",
    payload: {
      workspace_id: "harborpoint_urgent_reroute_workspace",
      milestone: "connected_crm",
      user_id: "harborpoint_urgent_reroute_user",
    },
  });
  const after = await getRoutingDecisionsForEntity("lead", "acc_harborpoint_lead_01");
  const persisted = after.find(
    (decision) =>
      decision.triggerSignalId === signal.signalId &&
      decision.decisionType === "named_account_owner" &&
      decision.slaTargetMinutes === 240,
  );

  assert.equal(signal.status, SignalStatus.MATCHED);
  assert.ok(persisted);
  assert.ok(after.length > beforeCount);
  assert.equal(persisted?.decisionType, "named_account_owner");
  assert.equal(persisted?.assignedOwner?.id, "usr_elena_morales");
  assert.equal(persisted?.triggerSignalId, signal.signalId);
  assert.equal(persisted?.slaTargetMinutes, 240);
  assert.equal(persisted?.slaDueAtIso, "2026-03-27T22:02:00.000Z");
  assert.deepEqual(persisted?.reasonCodes, ["account_is_named", "sla_product_qualified_4h"]);
  assert.deepEqual(
    persisted?.reasonDetails.map((detail) => detail.code),
    persisted?.reasonCodes,
  );
  assert.ok((persisted?.explanation.summary.length ?? 0) > 0);
  assert.deepEqual(
    persisted?.explanation.reasonDetails.map((detail) => detail.code),
    persisted?.reasonCodes,
  );
  assert.equal(persisted?.explanation.assignment.queue, persisted?.assignedQueue);
  assert.equal(persisted?.explanation.capacity.checkedOwners[0]?.ownerId, "usr_elena_morales");
  assert.deepEqual(
    persisted?.explanation.evaluatedPolicies[0]?.reasonDetails.map((detail) => detail.code),
    persisted?.explanation.evaluatedPolicies[0]?.reasonCodes,
  );
  assert.deepEqual(persisted?.explanation.sla.reasonCodes, ["sla_product_qualified_4h"]);
  assert.deepEqual(
    persisted?.explanation.sla.reasonDetails.map((detail) => detail.code),
    ["sla_product_qualified_4h"],
  );
});
