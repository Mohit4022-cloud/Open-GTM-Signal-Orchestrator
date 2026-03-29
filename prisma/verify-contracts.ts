import { ScoreEntityType, Segment, SignalStatus, Temperature } from "@prisma/client";

import { getDashboardTaskSummary, getRecommendationsList, getTaskQueue } from "../lib/actions";
import { generateAccountSummary, generateActionNote } from "../lib/ai";
import { getAuditLogForEntity, getRecentAuditEvents } from "../lib/audit/queries";
import { getAccountById, getAccounts } from "../lib/queries/accounts";
import { getLeadById, getLeadQueue } from "../lib/queries/leads";
import {
  getDashboardSummary,
  getHotAccounts,
  getRecentSignals as getDashboardRecentSignals,
} from "../lib/queries/dashboard";
import {
  getAccountTimeline,
  getRecentSignals,
  getSignalById,
  getUnmatchedSignals,
} from "../lib/data/signals";
import {
  getAccountScoreBreakdown,
  getLeadScoreBreakdown,
  getScoreHistoryForEntity,
} from "../lib/scoring";
import {
  getRecentRoutingDecisions,
  getRoutingDecisionById,
  getRoutingDecisionsForEntity,
  simulateRouting,
} from "../lib/routing";

const DASHBOARD_KPI_KEYS = [
  "signalsReceivedToday",
  "routedToday",
  "unmatchedSignals",
  "hotAccounts",
  "slaBreaches",
  "averageSpeedToLead",
] as const;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const [
    summary,
    hotAccounts,
    dashboardRecentSignals,
    signalFeed,
    unmatchedSignals,
    allAccounts,
    strategicAccounts,
    ownerAccounts,
    hotBucketAccounts,
    urgentBucketAccounts,
    recentRoutingDecisions,
    taskSummary,
    recentAuditEntries,
    hotRecentlyRoutedLeads,
  ] = await Promise.all([
    getDashboardSummary(),
    getHotAccounts(),
    getDashboardRecentSignals(),
    getRecentSignals(),
    getUnmatchedSignals(),
    getAccounts(),
    getAccounts({ segment: Segment.STRATEGIC }),
    getAccounts({ owner: "usr_elena_morales" }),
    getAccounts({ scoreBucket: "hot" }),
    getAccounts({ scoreBucket: "urgent" }),
    getRecentRoutingDecisions(6),
    getDashboardTaskSummary(),
    getRecentAuditEvents(10),
    getLeadQueue({ hot: true, recentlyRouted: true }),
  ]);

  invariant(
    summary.kpis.length === DASHBOARD_KPI_KEYS.length,
    `Expected ${DASHBOARD_KPI_KEYS.length} dashboard KPIs, found ${summary.kpis.length}.`,
  );
  invariant(
    summary.kpis.every((kpi, index) => kpi.key === DASHBOARD_KPI_KEYS[index]),
    "Dashboard KPI keys are out of order or missing.",
  );
  invariant(
    summary.signalVolume14d.length === 14,
    `Expected 14 trend points, found ${summary.signalVolume14d.length}.`,
  );
  invariant(
    summary.slaHealth.length === 3,
    `Expected 3 SLA health points, found ${summary.slaHealth.length}.`,
  );
  invariant(Boolean(summary.slaSummary.asOfIso), "Dashboard summary must include SLA summary metadata.");
  invariant(
    typeof summary.slaSummary.leadMetrics.openTrackedCount === "number" &&
      typeof summary.slaSummary.taskMetrics.openTrackedCount === "number",
    "Dashboard summary must expose typed lead and task SLA metrics.",
  );

  invariant(hotAccounts.length > 0, "Expected at least one hot account.");
  invariant(hotAccounts.length <= 6, `Expected at most 6 hot accounts, found ${hotAccounts.length}.`);
  invariant(
    hotAccounts.every((account) => Boolean(account.segmentLabel) && Boolean(account.statusLabel)),
    "Hot accounts must include both raw enums and display labels.",
  );
  invariant(
    hotAccounts.every(
      (account) =>
        (account.temperature === Temperature.HOT || account.temperature === Temperature.URGENT) &&
        Boolean(account.temperatureLabel) &&
        Boolean(account.scoringVersion) &&
        account.scoreLastComputedAtIso !== undefined,
    ),
    "Hot accounts must expose temperature and scoring snapshot metadata.",
  );
  invariant(
    hotAccounts.every((account, index, accounts) => {
      if (index === 0) {
        return true;
      }

      const previous = accounts[index - 1];
      if (previous.score !== account.score) {
        return previous.score >= account.score;
      }

      const previousSignalAt = previous.lastSignalAtIso ? new Date(previous.lastSignalAtIso).getTime() : 0;
      const currentSignalAt = account.lastSignalAtIso ? new Date(account.lastSignalAtIso).getTime() : 0;

      if (previousSignalAt !== currentSignalAt) {
        return previousSignalAt >= currentSignalAt;
      }

      return previous.name.localeCompare(account.name) <= 0;
    }),
    "Hot accounts are not ordered by score, latest signal, then name.",
  );

  invariant(signalFeed.length === 8, `Expected 8 recent signal feed rows, found ${signalFeed.length}.`);
  invariant(
    signalFeed.every((signal) => signal.dedupeKey.length > 0 && signal.normalizedSummary.payloadSummary.length > 0),
    "Recent signal feed items must include dedupe keys and normalized summaries.",
  );
  invariant(
    signalFeed.some((signal) => signal.status === SignalStatus.UNMATCHED),
    "Expected at least one unmatched signal in the new recent signal feed.",
  );

  invariant(dashboardRecentSignals.length === 8, `Expected 8 dashboard recent signals, found ${dashboardRecentSignals.length}.`);
  invariant(
    dashboardRecentSignals.some((signal) => signal.isUnmatched),
    "Expected at least one unmatched signal in the dashboard recent signal feed.",
  );

  invariant(unmatchedSignals.length >= 10, `Expected at least 10 unmatched signals, found ${unmatchedSignals.length}.`);
  invariant(
    unmatchedSignals.every((signal) => signal.reasonCodes.length > 0),
    "Unmatched queue items must include machine-readable reason codes.",
  );
  invariant(
    unmatchedSignals.every(
      (signal) =>
        signal.reasonDetails.length > 0 &&
        signal.primaryReason.recommendedQueue === signal.recommendedQueue &&
        signal.accountDomainDisplay.length > 0 &&
        signal.contactEmailDisplay.length > 0,
    ),
    "Unmatched queue items must include display-safe reason metadata and identity candidate labels.",
  );

  invariant(allAccounts.rows.length === 20, `Expected 20 accounts, found ${allAccounts.rows.length}.`);
  invariant(
    allAccounts.options.scoreBuckets.length === 4,
    `Expected 4 score bucket options, found ${allAccounts.options.scoreBuckets.length}.`,
  );
  invariant(
    strategicAccounts.rows.every((account) => account.segment === Segment.STRATEGIC),
    "Segment filters should return only the requested segment.",
  );
  invariant(
    ownerAccounts.rows.every((account) => account.ownerId === "usr_elena_morales"),
    "Owner filters should return only the requested owner.",
  );
  invariant(
    hotBucketAccounts.rows.every((account) => account.temperature === Temperature.HOT),
    "Hot score bucket filters should only return hot accounts.",
  );
  invariant(
    urgentBucketAccounts.rows.every((account) => account.temperature === Temperature.URGENT),
    "Urgent score bucket filters should only return urgent accounts.",
  );

  const accountDetail = await getAccountById("acc_summitflow_finance");
  invariant(accountDetail, "Expected seeded account detail for acc_summitflow_finance.");
  invariant(accountDetail.metadata.id === "acc_summitflow_finance", "Account detail metadata ID mismatch.");
  invariant(accountDetail.namedOwner !== null, "Expected account detail to include a named owner.");
  invariant(accountDetail.contacts.length > 0, "Expected account detail contacts.");
  invariant(accountDetail.relatedLeads.length > 0, "Expected account detail related leads.");
  invariant(accountDetail.recentSignals.length > 0, "Expected account detail recent signals.");
  invariant(accountDetail.openTasks.length > 0, "Expected account detail open tasks.");
  invariant(accountDetail.scoreBreakdown.length > 0, "Expected account detail score breakdown.");
  invariant(accountDetail.score.componentBreakdown.length > 0, "Expected account detail score contract.");
  invariant(accountDetail.scoreHistory.length > 0, "Expected account detail score history.");
  invariant(Boolean(accountDetail.metadata.temperatureLabel), "Expected account temperature label.");
  invariant(Boolean(accountDetail.metadata.scoringVersion), "Expected account scoring version.");
  invariant(
    accountDetail.relatedLeads.every(
      (lead) =>
        typeof lead.fitScore === "number" &&
        Boolean(lead.scoringVersion) &&
        lead.scoreLastComputedAtIso !== undefined &&
        typeof lead.sla.currentState === "string" &&
        "timeRemainingMs" in lead.sla,
    ),
    "Related leads must expose fit scores and scoring snapshot metadata.",
  );
  invariant(
    accountDetail.openTasks.every(
      (task) =>
        Boolean(task.actionType) &&
        Boolean(task.actionCategory) &&
        Boolean(task.priorityCode) &&
        task.reasonSummary.relatedReasonCodes.length > 0 &&
        Boolean(task.explanation.summary) &&
        typeof task.sla.currentState === "string" &&
        typeof task.sla.isTracked === "boolean",
    ),
    "Account detail open tasks must expose stable action metadata, reason summaries, and explanations.",
  );
  invariant(accountDetail.auditLog.length > 0, "Expected account detail audit log.");
  invariant(
    recentAuditEntries.length > 0 &&
      recentAuditEntries.every(
        (entry) =>
          Boolean(entry.id) &&
          Boolean(entry.timestampIso) &&
          Boolean(entry.actor.summary) &&
          Boolean(entry.action) &&
          Boolean(entry.entity.summary) &&
          Boolean(entry.reason.summary) &&
          Boolean(entry.explanation),
      ),
    "Recent audit events must expose the stable Phase 4 audit contract.",
  );
  const accountAudit = await getAuditLogForEntity("account", "acc_summitflow_finance", { limit: 8 });
  invariant(accountAudit.length > 0, "Expected canonical account audit history.");
  invariant(
    accountAudit.some((entry) => entry.entity.accountId === "acc_summitflow_finance"),
    "Account audit history should include cross-entity account-linked rows.",
  );

  const [atlasLeadQueue, beaconOpsRecommendations, breachedLeadQueue, atlasLeadDetail] = await Promise.all([
    getTaskQueue({ entityType: "lead", entityId: "acc_atlas_grid_lead_01" }),
    getRecommendationsList("account", "acc_beaconops"),
    getLeadQueue({ tracked: true, slaState: "breached" }),
    getLeadById("acc_atlas_grid_lead_01"),
  ]);

  invariant(atlasLeadQueue.rows.length > 0, "Expected Atlas Grid lead queue rows.");
  invariant(
    atlasLeadQueue.rows.every(
      (task) =>
        Boolean(task.taskType) &&
        Boolean(task.actionType) &&
        Boolean(task.actionCategory) &&
        Boolean(task.priorityCode) &&
        Boolean(task.priorityLabel) &&
        Boolean(task.reasonSummary.primaryCode) &&
        Boolean(task.createdAtIso) &&
        Boolean(task.linkedEntity.entityType) &&
        Boolean(task.explanation.summary) &&
        typeof task.sla.currentState === "string" &&
        typeof task.sla.isTracked === "boolean",
    ),
    "Task queue rows must expose frontend-safe action contracts.",
  );
  invariant(
    beaconOpsRecommendations.rows.some(
      (recommendation) => recommendation.recommendationType === "ADD_TO_NURTURE_QUEUE",
    ),
    "BeaconOps recommendations should include the nurture recommendation contract.",
  );
  invariant(
    breachedLeadQueue.rows.every(
      (lead) => lead.sla.isTracked && lead.sla.currentState === "breached",
    ),
    "Lead queue rows must expose SLA-safe filtering.",
  );
  invariant(atlasLeadDetail !== null, "Expected Atlas lead detail.");
  invariant(
    atlasLeadDetail?.events.some((event) => event.eventType === "breached"),
    "Lead detail must expose SLA event history.",
  );
  invariant(
    atlasLeadDetail?.sla.currentState === "breached",
    "Lead detail must expose the nested SLA snapshot.",
  );
  invariant(
    hotRecentlyRoutedLeads.rows.every(
      (lead) =>
        lead.queueFlags.isHot &&
        lead.queueFlags.isRecentlyRouted &&
        "currentQueue" in lead.routing,
    ),
    "Lead queue rows must expose stable routing and queue-flag contracts.",
  );
  invariant(
    typeof taskSummary.asOfIso === "string" &&
      typeof taskSummary.openCount === "number" &&
      typeof taskSummary.breachedCount === "number" &&
      typeof taskSummary.dueSoonCount === "number",
    "Dashboard task summary must expose stable Phase 4 aggregate fields.",
  );

  const [accountScore, leadScore, accountHistory] = await Promise.all([
    getAccountScoreBreakdown("acc_summitflow_finance"),
    getLeadScoreBreakdown("acc_summitflow_finance_lead_01"),
    getScoreHistoryForEntity(ScoreEntityType.ACCOUNT, "acc_summitflow_finance", { limit: 5 }),
  ]);

  invariant(accountScore !== null, "Expected account score breakdown.");
  invariant(accountScore.componentBreakdown.length === 6, "Account score breakdown should include 6 components.");
  invariant(accountScore.topReasonCodes.length > 0, "Account score breakdown should include reason codes.");
  invariant(Boolean(accountScore.explanation.summary), "Account score breakdown should include an explanation.");
  invariant(Boolean(accountScore.scoringVersion), "Account score breakdown should include a version.");

  invariant(leadScore !== null, "Expected lead score breakdown.");
  invariant(leadScore.componentBreakdown.length === 6, "Lead score breakdown should include 6 components.");
  invariant(leadScore.topReasonCodes.length > 0, "Lead score breakdown should include reason codes.");
  invariant(Boolean(leadScore.explanation.summary), "Lead score breakdown should include an explanation.");
  invariant(Boolean(leadScore.scoringVersion), "Lead score breakdown should include a version.");

  invariant(accountHistory.rows.length > 0, "Expected account score history rows.");
  invariant(
    accountHistory.rows.every(
      (row) =>
        row.reasonCodes.length > 0 &&
        row.componentBreakdown.length === 6 &&
        Boolean(row.explanation.summary) &&
        Boolean(row.scoringVersion),
    ),
    "Account score history rows must expose stable score contracts.",
  );
  invariant(
    accountHistory.rows.some((row) => row.trigger.signalSummary !== null || row.trigger.signalId === null),
    "Score history rows must expose trigger summaries when a signal is present.",
  );

  const accountTimeline = await getAccountTimeline("acc_summitflow_finance", { limit: 8 });
  invariant(accountTimeline.length > 0, "Expected account timeline rows.");
  invariant(
    accountTimeline.every((item, index, array) => {
      if (index === 0) {
        return true;
      }
      const previous = array[index - 1]!;
      const previousOccurredAt = new Date(previous.occurredAtIso).getTime();
      const currentOccurredAt = new Date(item.occurredAtIso).getTime();

      if (previousOccurredAt !== currentOccurredAt) {
        return previousOccurredAt >= currentOccurredAt;
      }

      return new Date(previous.receivedAtIso).getTime() >= new Date(item.receivedAtIso).getTime();
    }),
    "Account timeline is not ordered by occurredAt descending with receivedAt tiebreaks.",
  );
  invariant(
    accountTimeline.every(
      (item) =>
        item.displayTitle.length > 0 &&
        item.displaySubtitle.length > 0 &&
        item.eventTypeLabel.length > 0 &&
        item.sourceSystemLabel.length > 0 &&
        item.statusLabel.length > 0 &&
        item.receivedAtIso.length > 0,
    ),
    "Account timeline items must include stable labels and received timestamps.",
  );

  const signalDetail = await getSignalById(unmatchedSignals[0]!.signalId);
  invariant(signalDetail !== null, "Expected signal detail for unmatched signal.");
  invariant(signalDetail.reasonCodes.length > 0, "Signal detail must include reason codes.");
  invariant(signalDetail.auditTrail.length >= 3, "Signal detail must include audit trail entries.");

  invariant(recentRoutingDecisions.length > 0, "Expected recent routing decisions.");
  invariant(
    recentRoutingDecisions.every(
      (decision) =>
        decision.policyVersion === "routing/v1" &&
        decision.assignedQueue.length > 0 &&
        decision.reasonCodes.length > 0 &&
        decision.explanation.appliedPolicy.policyKey.length > 0 &&
        decision.explanation.evaluatedPolicies.length > 0 &&
        decision.explanation.assignment.queue === decision.assignedQueue,
    ),
    "Recent routing decisions must expose stable typed routing contracts.",
  );

  const routingDecisionById = await getRoutingDecisionById(recentRoutingDecisions[0]!.id);
  invariant(routingDecisionById !== null, "Expected routing decision lookup by ID.");
  invariant(
    routingDecisionById.id === recentRoutingDecisions[0]!.id,
    "Routing decision lookup should return the requested decision.",
  );

  const beaconOpsRoutingHistory = await getRoutingDecisionsForEntity("lead", "acc_beaconops_lead_01");
  invariant(beaconOpsRoutingHistory.length === 1, "Expected one persisted routing decision for the seeded BeaconOps lead.");
  invariant(
    beaconOpsRoutingHistory[0]!.explanation.capacity.fallbackTriggered,
    "BeaconOps routing history should expose capacity fallback metadata.",
  );
  invariant(
    beaconOpsRoutingHistory[0]!.reasonCodes.includes("fallback_after_capacity"),
    "BeaconOps routing history should expose fallback reason codes.",
  );

  const simulatedRouting = await simulateRouting({
    accountDomain: "beaconopspartners.com",
    geography: "NA_WEST",
    segment: "SMB",
    accountTier: "TIER_3",
    namedAccount: true,
    namedOwnerId: "usr_miles_turner",
    existingOwnerId: "usr_owen_price",
    leadSource: "Pricing page revisit",
    inboundType: "Inbound",
    temperature: Temperature.HOT,
    capacityScenario: "named_owner_overloaded",
  });
  invariant(
    simulatedRouting.decisionType === "existing_account_owner",
    "Routing simulation should fall back from the named owner to the existing owner when capacity is overloaded.",
  );
  invariant(
    simulatedRouting.simulatedOwner?.id === "usr_owen_price",
    "Routing simulation should select Owen Price.",
  );
  invariant(
    simulatedRouting.reasonCodes.includes("fallback_after_capacity"),
    "Routing simulation should expose fallback_after_capacity.",
  );
  invariant(
    simulatedRouting.explanation.assignment.queue.length > 0,
    "Routing simulation should expose a structured assignment queue.",
  );

  const missingAccount = await getAccountById("acc_missing");
  invariant(missingAccount === null, "Expected null for a missing account lookup.");

  const previousAiProvider = process.env.AI_PROVIDER;
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousOpenAiModel = process.env.OPENAI_MODEL;

  process.env.AI_PROVIDER = "noop";
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;

  try {
    const [accountSummary, actionNote] = await Promise.all([
      generateAccountSummary("acc_summitflow_finance"),
      generateActionNote("acc_atlas_grid_lead_01"),
    ]);

    invariant(accountSummary !== null, "Expected AI account summary contract.");
    invariant(accountSummary.status === "unavailable", "Expected deterministic unavailable account summary status.");
    invariant(accountSummary.summary.length > 0, "Expected deterministic fallback summary text.");
    invariant(accountSummary.keyDrivers.length > 0, "Expected deterministic fallback key drivers.");
    invariant(accountSummary.generatedAt === null, "Unavailable account summary should not expose generatedAt.");
    invariant(accountSummary.provider === null, "Unavailable account summary should not expose provider metadata.");
    invariant(
      typeof accountSummary.sourceSummary.score === "number" &&
        typeof accountSummary.sourceSummary.recentSignalCount === "number" &&
        typeof accountSummary.sourceSummary.openTaskCount === "number",
      "Account AI source summary must expose stable numeric grounding fields.",
    );

    invariant(actionNote !== null, "Expected AI action note contract.");
    invariant(actionNote.status === "unavailable", "Expected deterministic unavailable action note status.");
    invariant(actionNote.note.length > 0, "Expected deterministic fallback action note text.");
    invariant(actionNote.suggestedAngle.length > 0, "Expected deterministic fallback suggested angle.");
    invariant(actionNote.generatedAt === null, "Unavailable action note should not expose generatedAt.");
    invariant(actionNote.provider === null, "Unavailable action note should not expose provider metadata.");
    invariant(
      typeof actionNote.sourceSummary.leadScore === "number" &&
        Array.isArray(actionNote.sourceSummary.topReasonCodes) &&
        typeof actionNote.sourceSummary.recentSignalsUsed === "number",
      "Action note source summary must expose stable grounded lead fields.",
    );
    invariant(
      actionNote.deterministicGuardrail.length > 0,
      "Action note contract must expose the deterministic guardrail string.",
    );
  } finally {
    process.env.AI_PROVIDER = previousAiProvider;
    process.env.OPENAI_API_KEY = previousOpenAiKey;
    process.env.OPENAI_MODEL = previousOpenAiModel;
  }

  console.log("Contract verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
