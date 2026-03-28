import {
  AuditEventType,
  Geography,
  PrismaClient,
  RoutingDecisionType as PrismaRoutingDecisionType,
  RoutingEntityType as PrismaRoutingEntityType,
  ScoreEntityType,
  ScoreTriggerType,
  SignalStatus,
  SignalType,
  Temperature,
} from "@prisma/client";

import {
  identityResolutionCodeValues,
  type IdentityResolutionCode,
} from "../lib/contracts/signals";
import {
  routingReasonCodeValues,
  type RoutingReasonCode,
} from "../lib/contracts/routing";
import type { ScoreReasonCode } from "../lib/contracts/scoring";
import { scoreReasonCodeValues } from "../lib/scoring/reason-codes";
import { sqliteAdapter } from "../lib/prisma-adapter";

const prisma = new PrismaClient({
  adapter: sqliteAdapter,
});

const requiredIndustries = ["SaaS", "Manufacturing", "Healthcare", "Retail", "Fintech"] as const;
const requiredSourceSystems = [
  "website",
  "marketing_automation",
  "events",
  "product",
  "sales_engagement",
  "calendar",
  "third_party_intent",
  "sales_note",
  "crm",
] as const;
const routingDecisionContractTypeByPrisma: Record<PrismaRoutingDecisionType, string> = {
  NAMED_ACCOUNT_OWNER: "named_account_owner",
  EXISTING_ACCOUNT_OWNER: "existing_account_owner",
  STRATEGIC_TIER_OVERRIDE: "strategic_tier_override",
  TERRITORY_SEGMENT_RULE: "territory_segment_rule",
  ROUND_ROBIN_POOL: "round_robin_pool",
  OPS_REVIEW_QUEUE: "ops_review_queue",
};
const reasonCodeSet = new Set<IdentityResolutionCode>(identityResolutionCodeValues);
const scoreReasonCodeSet = new Set<ScoreReasonCode>(scoreReasonCodeValues);
const routingReasonCodeSet = new Set<RoutingReasonCode>(routingReasonCodeValues);

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseIdentityReasonCodes(value: unknown): IdentityResolutionCode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is IdentityResolutionCode => {
    return typeof item === "string" && reasonCodeSet.has(item as IdentityResolutionCode);
  });
}

function parseScoreReasonCodes(value: unknown): ScoreReasonCode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is ScoreReasonCode => {
    return typeof item === "string" && scoreReasonCodeSet.has(item as ScoreReasonCode);
  });
}

function parseRoutingReasonCodes(value: unknown): RoutingReasonCode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is RoutingReasonCode => {
    return typeof item === "string" && routingReasonCodeSet.has(item as RoutingReasonCode);
  });
}

function parseComponentBreakdown(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is { key: string; score: number } => {
    return Boolean(item) && typeof item === "object" && typeof item.key === "string" && typeof item.score === "number";
  });
}

function parseExplanation(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const summary = (value as { summary?: unknown }).summary;
  return typeof summary === "string" ? summary : null;
}

function parseRoutingExplanation(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const appliedPolicy = isRecord(value.appliedPolicy) ? value.appliedPolicy : null;
  const assignment = isRecord(value.assignment) ? value.assignment : null;
  const capacity = isRecord(value.capacity) ? value.capacity : null;
  const sla = isRecord(value.sla) ? value.sla : null;
  const evaluatedPolicies = Array.isArray(value.evaluatedPolicies) ? value.evaluatedPolicies : [];
  const reasonCodes = parseRoutingReasonCodes(value.reasonCodes);

  if (
    !appliedPolicy ||
    !assignment ||
    !capacity ||
    !sla ||
    typeof value.decision !== "string" ||
    typeof appliedPolicy.precedence !== "number" ||
    typeof appliedPolicy.policyKey !== "string" ||
    typeof appliedPolicy.decisionType !== "string" ||
    typeof assignment.queue !== "string" ||
    typeof capacity.fallbackTriggered !== "boolean" ||
    !Array.isArray(capacity.checkedOwners) ||
    typeof sla.targetMinutes !== "number" &&
      sla.targetMinutes !== null
  ) {
    return null;
  }

  return {
    decision: value.decision,
    appliedPolicy,
    assignment,
    capacity,
    sla,
    evaluatedPolicies,
    reasonCodes,
  };
}

function getComponentScore(components: Array<{ key: string; score: number }>, key: string) {
  return components.find((component) => component.key === key)?.score ?? null;
}

async function main() {
  const [users, accounts, contacts, leads, signals, tasks, routingDecisions, scoreHistory, auditLogs] =
    await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          maxOpenHotLeads: true,
          maxDailyInboundAssignments: true,
          maxOpenTasks: true,
        },
      }),
      prisma.account.findMany({
        select: {
          id: true,
          domain: true,
          segment: true,
          accountTier: true,
          geography: true,
          industry: true,
          namedOwnerId: true,
          ownerId: true,
          overallScore: true,
          fitScore: true,
          intentScore: true,
          engagementScore: true,
          recencyScore: true,
          productUsageScore: true,
          manualPriorityScore: true,
          temperature: true,
          scoreBreakdownJson: true,
          scoreReasonCodesJson: true,
          scoreExplanationJson: true,
          scoreLastComputedAt: true,
          scoringVersion: true,
        },
      }),
      prisma.contact.findMany({
        select: {
          id: true,
          accountId: true,
        },
      }),
      prisma.lead.findMany({
        select: {
          id: true,
          accountId: true,
          contactId: true,
          source: true,
          inboundType: true,
          status: true,
          currentOwnerId: true,
          routedAt: true,
          slaDeadlineAt: true,
          score: true,
          fitScore: true,
          intentScore: true,
          engagementScore: true,
          recencyScore: true,
          productUsageScore: true,
          manualPriorityScore: true,
          temperature: true,
          scoreBreakdownJson: true,
          scoreReasonCodesJson: true,
          scoreExplanationJson: true,
          scoreLastComputedAt: true,
          scoringVersion: true,
        },
      }),
      prisma.signalEvent.findMany({
        select: {
          id: true,
          sourceSystem: true,
          eventType: true,
          accountId: true,
          accountDomain: true,
          contactId: true,
          contactEmail: true,
          leadId: true,
          status: true,
          dedupeKey: true,
          payloadSummary: true,
          identityResolutionCodesJson: true,
          occurredAt: true,
          receivedAt: true,
          createdAt: true,
          updatedAt: true,
          errorMessage: true,
        },
      }),
      prisma.task.findMany({
        select: {
          id: true,
          accountId: true,
          leadId: true,
          ownerId: true,
        },
      }),
      prisma.routingDecision.findMany({
        select: {
          id: true,
          entityType: true,
          entityId: true,
          accountId: true,
          leadId: true,
          policyVersion: true,
          decisionType: true,
          assignedOwnerId: true,
          secondaryOwnerId: true,
          assignedTeam: true,
          assignedQueue: true,
          reasonCodesJson: true,
          explanationJson: true,
          slaTargetMinutes: true,
          slaDueAt: true,
          escalationPolicyKey: true,
          triggerSignalId: true,
          createdAt: true,
        },
      }),
      prisma.scoreHistory.findMany({
        select: {
          id: true,
          entityType: true,
          entityId: true,
          accountId: true,
          leadId: true,
          componentBreakdownJson: true,
          reasonCodesJson: true,
          explanationJson: true,
          triggerType: true,
          triggerSignalId: true,
          scoringVersion: true,
        },
      }),
      prisma.auditLog.findMany({
        select: {
          id: true,
          eventType: true,
          entityType: true,
          entityId: true,
          accountId: true,
          leadId: true,
        },
      }),
    ]);

  invariant(users.length === 12, `Expected 12 users, found ${users.length}.`);
  invariant(accounts.length === 20, `Expected 20 accounts, found ${accounts.length}.`);
  invariant(contacts.length === 40, `Expected 40 contacts, found ${contacts.length}.`);
  invariant(leads.length === 30, `Expected 30 leads, found ${leads.length}.`);
  invariant(signals.length >= 120, `Expected at least 120 signal events, found ${signals.length}.`);
  invariant(tasks.length === 40, `Expected 40 tasks, found ${tasks.length}.`);
  invariant(routingDecisions.length === 30, `Expected 30 routing decisions, found ${routingDecisions.length}.`);

  const accountIds = new Set(accounts.map((account) => account.id));
  const userIds = new Set(users.map((user) => user.id));
  const contactIds = new Set(contacts.map((contact) => contact.id));
  const leadIds = new Set(leads.map((lead) => lead.id));

  const accountTemperatures = new Set(accounts.map((account) => account.temperature));
  const leadTemperatures = new Set(leads.map((lead) => lead.temperature));
  const linkedSignalsByAccount = new Map<string, number>();
  const contactsByAccount = new Map<string, number>();
  const leadsByAccount = new Map<string, number>();
  const sourceSystems = new Set<string>();
  const signalTypes = new Set<SignalType>();
  const identityReasonCodes = new Set<IdentityResolutionCode>();
  const signalEventIds = new Set(signals.map((signal) => signal.id));

  for (const user of users) {
    invariant(user.maxOpenHotLeads >= 1, `User ${user.id} must define maxOpenHotLeads.`);
    invariant(user.maxDailyInboundAssignments >= 0, `User ${user.id} must define maxDailyInboundAssignments.`);
    invariant(user.maxOpenTasks >= 1, `User ${user.id} must define maxOpenTasks.`);
  }
  invariant(
    users.some((user) => user.maxDailyInboundAssignments === 0),
    "Expected at least one overloaded-capacity scenario user.",
  );

  invariant(accountTemperatures.has(Temperature.COLD), "Expected at least one cold account.");
  invariant(accountTemperatures.has(Temperature.WARM), "Expected at least one warm account.");
  invariant(accountTemperatures.has(Temperature.HOT), "Expected at least one hot account.");
  invariant(accountTemperatures.has(Temperature.URGENT), "Expected at least one urgent account.");
  invariant(leadTemperatures.has(Temperature.COLD), "Expected at least one cold lead.");
  invariant(leadTemperatures.has(Temperature.WARM), "Expected at least one warm lead.");
  invariant(leadTemperatures.has(Temperature.HOT), "Expected at least one hot lead.");
  invariant(leadTemperatures.has(Temperature.URGENT), "Expected at least one urgent lead.");
  invariant(
    leads.filter((lead) => lead.temperature === Temperature.URGENT).length >= 3,
    "Expected at least three urgent leads.",
  );

  for (const industry of requiredIndustries) {
    invariant(accounts.some((account) => account.industry === industry), `Missing ${industry} industry coverage.`);
  }

  invariant(accounts.some((account) => account.geography === Geography.NA_WEST), "Missing NA West coverage.");
  invariant(accounts.some((account) => account.geography === Geography.NA_EAST), "Missing NA East coverage.");
  invariant(accounts.some((account) => account.geography === Geography.EMEA), "Missing EMEA coverage.");
  invariant(accounts.some((account) => account.geography === Geography.APAC), "Missing APAC coverage.");

  for (const contact of contacts) {
    invariant(accountIds.has(contact.accountId), `Contact ${contact.id} references missing account ${contact.accountId}.`);
    contactsByAccount.set(contact.accountId, (contactsByAccount.get(contact.accountId) ?? 0) + 1);
  }

  for (const lead of leads) {
    invariant(accountIds.has(lead.accountId), `Lead ${lead.id} references missing account ${lead.accountId}.`);
    invariant(Boolean(lead.contactId), `Lead ${lead.id} is missing a contact reference.`);
    invariant(contactIds.has(lead.contactId!), `Lead ${lead.id} references missing contact ${lead.contactId}.`);
    if (lead.currentOwnerId !== null) {
      invariant(userIds.has(lead.currentOwnerId), `Lead ${lead.id} references missing owner ${lead.currentOwnerId}.`);
    }
    invariant(lead.routedAt !== null, `Lead ${lead.id} is missing routedAt.`);
    leadsByAccount.set(lead.accountId, (leadsByAccount.get(lead.accountId) ?? 0) + 1);

    const components = parseComponentBreakdown(lead.scoreBreakdownJson);
    invariant(lead.scoreLastComputedAt !== null, `Lead ${lead.id} is missing scoreLastComputedAt.`);
    invariant(lead.scoringVersion === "scoring/v1", `Lead ${lead.id} should use scoring/v1.`);
    invariant(components.length === 6, `Lead ${lead.id} should have 6 score components.`);
    invariant(getComponentScore(components, "fit") === lead.fitScore, `Lead ${lead.id} fit snapshot mismatch.`);
    invariant(getComponentScore(components, "intent") === lead.intentScore, `Lead ${lead.id} intent snapshot mismatch.`);
    invariant(
      getComponentScore(components, "engagement") === lead.engagementScore,
      `Lead ${lead.id} engagement snapshot mismatch.`,
    );
    invariant(getComponentScore(components, "recency") === lead.recencyScore, `Lead ${lead.id} recency snapshot mismatch.`);
    invariant(
      getComponentScore(components, "productUsage") === lead.productUsageScore,
      `Lead ${lead.id} product usage snapshot mismatch.`,
    );
    invariant(
      getComponentScore(components, "manualPriority") === lead.manualPriorityScore,
      `Lead ${lead.id} manual priority snapshot mismatch.`,
    );
    invariant(
      components.reduce((sum, component) => sum + component.score, 0) === lead.score,
      `Lead ${lead.id} total score does not match component breakdown.`,
    );
    invariant(
      parseScoreReasonCodes(lead.scoreReasonCodesJson).length > 0,
      `Lead ${lead.id} is missing persisted reason codes.`,
    );
    invariant(parseExplanation(lead.scoreExplanationJson), `Lead ${lead.id} is missing a persisted explanation.`);
  }

  for (const account of accounts) {
    const components = parseComponentBreakdown(account.scoreBreakdownJson);

    invariant(account.domain.length > 0, `Account ${account.id} is missing a domain.`);
    if (account.namedOwnerId) {
      invariant(userIds.has(account.namedOwnerId), `Account ${account.id} references missing named owner.`);
    }
    if (account.ownerId) {
      invariant(userIds.has(account.ownerId), `Account ${account.id} references missing existing owner.`);
    }
    invariant(account.scoreLastComputedAt !== null, `Account ${account.id} is missing scoreLastComputedAt.`);
    invariant(account.scoringVersion === "scoring/v1", `Account ${account.id} should use scoring/v1.`);
    invariant(components.length === 6, `Account ${account.id} should have 6 score components.`);
    invariant(getComponentScore(components, "fit") === account.fitScore, `Account ${account.id} fit snapshot mismatch.`);
    invariant(getComponentScore(components, "intent") === account.intentScore, `Account ${account.id} intent snapshot mismatch.`);
    invariant(
      getComponentScore(components, "engagement") === account.engagementScore,
      `Account ${account.id} engagement snapshot mismatch.`,
    );
    invariant(
      getComponentScore(components, "recency") === account.recencyScore,
      `Account ${account.id} recency snapshot mismatch.`,
    );
    invariant(
      getComponentScore(components, "productUsage") === account.productUsageScore,
      `Account ${account.id} product usage snapshot mismatch.`,
    );
    invariant(
      getComponentScore(components, "manualPriority") === account.manualPriorityScore,
      `Account ${account.id} manual priority snapshot mismatch.`,
    );
    invariant(
      components.reduce((sum, component) => sum + component.score, 0) === account.overallScore,
      `Account ${account.id} total score does not match component breakdown.`,
    );
    invariant(
      parseScoreReasonCodes(account.scoreReasonCodesJson).length > 0,
      `Account ${account.id} is missing persisted reason codes.`,
    );
    invariant(parseExplanation(account.scoreExplanationJson), `Account ${account.id} is missing a persisted explanation.`);
    invariant(contactsByAccount.get(account.id) === 2, `Account ${account.id} should have exactly 2 contacts.`);
    invariant((leadsByAccount.get(account.id) ?? 0) >= 1, `Account ${account.id} should have at least 1 lead.`);
  }

  const routingDecisionsByLeadId = new Map(
    routingDecisions.filter((decision) => decision.leadId !== null).map((decision) => [decision.leadId!, decision]),
  );

  invariant(
    routingDecisions.every((decision) => decision.entityType === PrismaRoutingEntityType.LEAD),
    "Seeded routing decisions should be lead-level decisions.",
  );

  for (const decision of routingDecisions) {
    invariant(decision.entityType === PrismaRoutingEntityType.LEAD, `Routing decision ${decision.id} has the wrong entity type.`);
    invariant(decision.leadId !== null, `Routing decision ${decision.id} should reference a lead.`);
    invariant(decision.accountId !== null, `Routing decision ${decision.id} should reference an account.`);
    invariant(decision.entityId === decision.leadId, `Routing decision ${decision.id} entityId should match leadId.`);
    invariant(leadIds.has(decision.leadId), `Routing decision ${decision.id} references missing lead ${decision.leadId}.`);
    invariant(accountIds.has(decision.accountId), `Routing decision ${decision.id} references missing account ${decision.accountId}.`);
    invariant(decision.policyVersion === "routing/v1", `Routing decision ${decision.id} should use routing/v1.`);
    invariant(decision.assignedQueue.length > 0, `Routing decision ${decision.id} is missing an assigned queue.`);

    const reasonCodes = parseRoutingReasonCodes(decision.reasonCodesJson);
    const explanation = parseRoutingExplanation(decision.explanationJson);

    invariant(reasonCodes.length > 0, `Routing decision ${decision.id} is missing reason codes.`);
    invariant(explanation !== null, `Routing decision ${decision.id} is missing a structured explanation.`);
    invariant(
      explanation.assignment.queue === decision.assignedQueue,
      `Routing decision ${decision.id} explanation queue does not match the persisted queue.`,
    );
    invariant(
      explanation.appliedPolicy.decisionType === routingDecisionContractTypeByPrisma[decision.decisionType],
      `Routing decision ${decision.id} explanation policy type does not match the persisted decision type.`,
    );
    invariant(
      explanation.evaluatedPolicies.length >= 1,
      `Routing decision ${decision.id} should include evaluated policy steps.`,
    );
    invariant(
      explanation.reasonCodes.length === reasonCodes.length,
      `Routing decision ${decision.id} explanation reason codes should mirror the persisted reason codes.`,
    );

    if (decision.assignedOwnerId) {
      invariant(userIds.has(decision.assignedOwnerId), `Routing decision ${decision.id} references missing owner ${decision.assignedOwnerId}.`);
    }

    if (decision.secondaryOwnerId) {
      invariant(userIds.has(decision.secondaryOwnerId), `Routing decision ${decision.id} references missing secondary owner.`);
    }

    if (decision.slaTargetMinutes === null) {
      invariant(decision.slaDueAt === null, `Routing decision ${decision.id} should not persist an SLA due date without a target.`);
    } else {
      invariant(decision.slaDueAt !== null, `Routing decision ${decision.id} is missing an SLA due date.`);
    }

    if (decision.decisionType === PrismaRoutingDecisionType.STRATEGIC_TIER_OVERRIDE) {
      invariant(decision.secondaryOwnerId !== null, `Routing decision ${decision.id} should include a secondary owner.`);
      invariant(decision.escalationPolicyKey !== null, `Routing decision ${decision.id} should include an escalation policy key.`);
    }

    if (decision.decisionType === PrismaRoutingDecisionType.OPS_REVIEW_QUEUE) {
      invariant(decision.assignedOwnerId === null, `Routing decision ${decision.id} should not assign an owner in ops review.`);
      invariant(
        reasonCodes.includes("sent_to_ops_review"),
        `Routing decision ${decision.id} should include sent_to_ops_review.`,
      );
    }
  }

  const northstarDecision = routingDecisionsByLeadId.get("acc_northstar_analytics_lead_01");
  invariant(northstarDecision, "Missing named-owner routing scenario for acc_northstar_analytics.");
  invariant(
    northstarDecision.decisionType === PrismaRoutingDecisionType.NAMED_ACCOUNT_OWNER,
    "Northstar should route via named account owner.",
  );
  invariant(northstarDecision.assignedOwnerId === "usr_dante_kim", "Northstar should route to Dante Kim.");
  invariant(
    parseRoutingReasonCodes(northstarDecision.reasonCodesJson).includes("account_is_named"),
    "Northstar should include account_is_named.",
  );

  const signalNestDecision = routingDecisionsByLeadId.get("acc_signalnest_lead_01");
  invariant(signalNestDecision, "Missing existing-owner routing scenario for acc_signalnest.");
  invariant(
    signalNestDecision.decisionType === PrismaRoutingDecisionType.EXISTING_ACCOUNT_OWNER,
    "SignalNest should preserve the existing owner.",
  );
  invariant(signalNestDecision.assignedOwnerId === "usr_owen_price", "SignalNest should route to Owen Price.");

  const beaconOpsDecision = routingDecisionsByLeadId.get("acc_beaconops_lead_01");
  invariant(beaconOpsDecision, "Missing capacity-fallback routing scenario for acc_beaconops.");
  invariant(
    beaconOpsDecision.decisionType === PrismaRoutingDecisionType.EXISTING_ACCOUNT_OWNER,
    "BeaconOps should fall back to the existing owner after named-owner capacity failure.",
  );
  invariant(beaconOpsDecision.assignedOwnerId === "usr_owen_price", "BeaconOps should route to Owen Price.");
  const beaconOpsExplanation = parseRoutingExplanation(beaconOpsDecision.explanationJson);
  invariant(beaconOpsExplanation, "BeaconOps should include a structured routing explanation.");
  invariant(
    beaconOpsExplanation.capacity.fallbackTriggered === true,
    "BeaconOps should record a capacity-driven fallback.",
  );
  invariant(
    beaconOpsExplanation.evaluatedPolicies.some(
      (step) =>
        isRecord(step) &&
        step.policyKey === "named-account-owner" &&
        step.selected === false &&
        step.skippedReason === "owner_over_capacity",
    ),
    "BeaconOps should record the named owner capacity rejection.",
  );

  const ironPeakDecision = routingDecisionsByLeadId.get("acc_ironpeak_lead_01");
  invariant(ironPeakDecision, "Missing strategic override routing scenario for acc_ironpeak.");
  invariant(
    ironPeakDecision.decisionType === PrismaRoutingDecisionType.STRATEGIC_TIER_OVERRIDE,
    "Iron Peak should route via the strategic override policy.",
  );
  invariant(ironPeakDecision.assignedOwnerId === "usr_elena_morales", "Iron Peak should route to Elena Morales.");
  invariant(ironPeakDecision.secondaryOwnerId === "usr_sarah_kim", "Iron Peak should pair Sarah Kim as secondary owner.");
  invariant(
    ironPeakDecision.escalationPolicyKey === "strategic-ae-sdr-pair",
    "Iron Peak should persist the strategic escalation policy key.",
  );

  const brightHarborDecision = routingDecisionsByLeadId.get("acc_brightharbor_retail_lead_01");
  invariant(brightHarborDecision, "Missing territory routing scenario for acc_brightharbor_retail.");
  invariant(
    brightHarborDecision.decisionType === PrismaRoutingDecisionType.TERRITORY_SEGMENT_RULE,
    "BrightHarbor should route through the territory + segment rule.",
  );
  invariant(
    brightHarborDecision.assignedQueue === "na-west-smb",
    "BrightHarbor should route to the NA West SMB queue.",
  );

  const cedarLoopDecision = routingDecisionsByLeadId.get("acc_cedar_loop_lead_01");
  invariant(cedarLoopDecision, "Missing round-robin fallback routing scenario for acc_cedar_loop.");
  invariant(
    cedarLoopDecision.decisionType === PrismaRoutingDecisionType.ROUND_ROBIN_POOL,
    "Cedar Loop should route through the round-robin fallback pool.",
  );
  invariant(cedarLoopDecision.assignedOwnerId === "usr_sarah_kim", "Cedar Loop should route to Sarah Kim.");

  const novachannelDecision = routingDecisionsByLeadId.get("acc_novachannel_lead_01");
  invariant(novachannelDecision, "Missing ops-review routing scenario for acc_novachannel.");
  invariant(
    novachannelDecision.decisionType === PrismaRoutingDecisionType.OPS_REVIEW_QUEUE,
    "NovaChannel should route to ops review.",
  );
  invariant(novachannelDecision.assignedOwnerId === null, "NovaChannel should not assign an owner.");
  invariant(novachannelDecision.assignedQueue === "ops-review", "NovaChannel should route to ops-review.");

  let matchedSignalCount = 0;
  let unmatchedSignalCount = 0;
  const dedupeKeys = new Set<string>();

  for (const signal of signals) {
    sourceSystems.add(signal.sourceSystem);
    signalTypes.add(signal.eventType);

    invariant(signal.dedupeKey.length > 0, `Signal ${signal.id} is missing a dedupe key.`);
    invariant(!dedupeKeys.has(signal.dedupeKey), `Duplicate dedupe key detected: ${signal.dedupeKey}.`);
    dedupeKeys.add(signal.dedupeKey);
    invariant(signal.payloadSummary.length > 0, `Signal ${signal.id} is missing payloadSummary.`);
    invariant(signal.receivedAt >= signal.occurredAt, `Signal ${signal.id} receivedAt precedes occurredAt.`);
    invariant(signal.createdAt >= signal.receivedAt, `Signal ${signal.id} createdAt precedes receivedAt.`);
    invariant(signal.updatedAt >= signal.createdAt, `Signal ${signal.id} updatedAt precedes createdAt.`);
    invariant(signal.errorMessage === null, `Seeded signal ${signal.id} should not have an error message.`);

    const parsedCodes = parseIdentityReasonCodes(signal.identityResolutionCodesJson);
    invariant(parsedCodes.length > 0, `Signal ${signal.id} is missing identity resolution codes.`);
    for (const reasonCode of parsedCodes) {
      identityReasonCodes.add(reasonCode);
    }

    if (signal.accountId) {
      invariant(accountIds.has(signal.accountId), `Signal ${signal.id} references missing account ${signal.accountId}.`);
      linkedSignalsByAccount.set(signal.accountId, (linkedSignalsByAccount.get(signal.accountId) ?? 0) + 1);
    }

    if (signal.contactId) {
      invariant(contactIds.has(signal.contactId), `Signal ${signal.id} references missing contact ${signal.contactId}.`);
    }

    if (signal.leadId) {
      invariant(leadIds.has(signal.leadId), `Signal ${signal.id} references missing lead ${signal.leadId}.`);
    }

    if (signal.status === SignalStatus.MATCHED) {
      matchedSignalCount += 1;
      invariant(Boolean(signal.accountId), `Matched signal ${signal.id} should resolve to an account.`);
    }

    if (signal.status === SignalStatus.UNMATCHED) {
      unmatchedSignalCount += 1;
      invariant(signal.accountId === null, `Unmatched signal ${signal.id} should not resolve an account.`);
      invariant(signal.contactId === null, `Unmatched signal ${signal.id} should not resolve a contact.`);
    }
  }

  invariant(matchedSignalCount >= 100, `Expected at least 100 matched signals, found ${matchedSignalCount}.`);
  invariant(unmatchedSignalCount >= 10, `Expected at least 10 unmatched signals, found ${unmatchedSignalCount}.`);

  for (const sourceSystem of requiredSourceSystems) {
    invariant(sourceSystems.has(sourceSystem), `Missing seeded source system coverage for ${sourceSystem}.`);
  }

  for (const signalType of Object.values(SignalType)) {
    invariant(signalTypes.has(signalType), `Missing seeded signal type coverage for ${signalType}.`);
  }

  for (const reasonCode of identityResolutionCodeValues) {
    invariant(identityReasonCodes.has(reasonCode), `Missing seeded identity reason code coverage for ${reasonCode}.`);
  }

  invariant(scoreHistory.length > 0, "Expected persisted score history rows.");
  invariant(
    scoreHistory.some((entry) => entry.entityType === ScoreEntityType.ACCOUNT),
    "Expected account score history rows.",
  );
  invariant(
    scoreHistory.some((entry) => entry.entityType === ScoreEntityType.LEAD),
    "Expected lead score history rows.",
  );
  invariant(
    scoreHistory.some((entry) => entry.triggerType === ScoreTriggerType.MANUAL_PRIORITY_CHANGED),
    "Expected manual priority score history rows.",
  );
  invariant(
    scoreHistory.some((entry) => entry.triggerType === ScoreTriggerType.MANUAL_RECOMPUTE),
    "Expected final snapshot score history rows.",
  );

  for (const entry of scoreHistory) {
    if (entry.accountId) {
      invariant(accountIds.has(entry.accountId), `Score history ${entry.id} references missing account ${entry.accountId}.`);
    }

    if (entry.leadId) {
      invariant(leadIds.has(entry.leadId), `Score history ${entry.id} references missing lead ${entry.leadId}.`);
    }

    if (entry.triggerSignalId) {
      invariant(
        signalEventIds.has(entry.triggerSignalId),
        `Score history ${entry.id} references missing trigger signal ${entry.triggerSignalId}.`,
      );
    }

    invariant(
      parseComponentBreakdown(entry.componentBreakdownJson).length === 6,
      `Score history ${entry.id} should persist 6 score components.`,
    );
    invariant(
      parseScoreReasonCodes(entry.reasonCodesJson).length > 0,
      `Score history ${entry.id} is missing reason codes.`,
    );
    invariant(parseExplanation(entry.explanationJson), `Score history ${entry.id} is missing explanation content.`);
    invariant(entry.scoringVersion === "scoring/v1", `Score history ${entry.id} should use scoring/v1.`);
  }

  const summitFlow = accounts.find((account) => account.id === "acc_summitflow_finance");
  invariant(summitFlow, "Expected seeded account acc_summitflow_finance.");
  invariant(
    parseScoreReasonCodes(summitFlow.scoreReasonCodesJson).includes("intent_pricing_page_cluster"),
    "SummitFlow Finance should reflect pricing-cluster intent.",
  );

  const signalNest = accounts.find((account) => account.id === "acc_signalnest");
  invariant(signalNest, "Expected seeded account acc_signalnest.");
  const signalNestReasons = parseScoreReasonCodes(signalNest.scoreReasonCodesJson);
  invariant(
    signalNestReasons.includes("product_usage_signup") ||
      signalNestReasons.includes("product_usage_team_invite") ||
      signalNestReasons.includes("product_usage_key_activation"),
    "SignalNest should reflect product-usage score drivers.",
  );

  const frontierRetail = accounts.find((account) => account.id === "acc_frontier_retail");
  invariant(frontierRetail, "Expected seeded account acc_frontier_retail.");
  const frontierReasons = parseScoreReasonCodes(frontierRetail.scoreReasonCodesJson);
  invariant(
    frontierReasons.includes("inactivity_decay_14d") || frontierReasons.includes("inactivity_decay_30d"),
    "Frontier Retail should reflect inactivity decay.",
  );

  const signalEventAuditLogs = auditLogs.filter((entry) => entry.entityType === "signal_event");
  invariant(signalEventAuditLogs.length > 0, "Expected signal-event audit logs.");
  invariant(
    signalEventAuditLogs.every((entry) => signalEventIds.has(entry.entityId)),
    "Signal-event audit rows must reference an existing signal event.",
  );
  invariant(
    auditLogs.some((entry) => entry.eventType === "SCORE_RECOMPUTED"),
    "Expected score recompute audit logs.",
  );
  invariant(
    auditLogs.some((entry) => entry.eventType === "SCORE_THRESHOLD_CROSSED"),
    "Expected threshold crossing audit logs.",
  );
  invariant(
    auditLogs.some((entry) => entry.eventType === "SCORE_MANUAL_PRIORITY_OVERRIDDEN"),
    "Expected manual priority override audit logs.",
  );
  invariant(
    auditLogs.filter((entry) => entry.eventType === AuditEventType.ROUTE_ASSIGNED).length ===
      routingDecisions.filter((decision) => decision.decisionType !== PrismaRoutingDecisionType.OPS_REVIEW_QUEUE).length,
    "Expected one ROUTE_ASSIGNED audit log for every owner-assigned routing decision.",
  );
  invariant(
    auditLogs.some((entry) => entry.eventType === AuditEventType.ROUTING_FALLBACK_CAPACITY),
    "Expected at least one routing fallback capacity audit log.",
  );
  invariant(
    auditLogs.some((entry) => entry.eventType === AuditEventType.ROUTING_SENT_TO_OPS_REVIEW),
    "Expected at least one ops-review routing audit log.",
  );

  console.log("Seed verification passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
