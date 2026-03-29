import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { AuditEventType, ScoreEntityType, SignalStatus, Temperature } from "@prisma/client";

import { attachSignal, ingestSignal } from "@/lib/data/signals";
import { db } from "@/lib/db";
import { scoreComponentKeyValues } from "@/lib/contracts/scoring";
import {
  DEFAULT_SCORING_CONFIG,
  computeAccountScore,
  computeLeadScore,
  deriveTemperature,
  clampTotalScore,
  getAccountScoreBreakdown,
  getLeadScoreBreakdown,
  getScoreHistoryForEntity,
  recomputeAccountScore,
  scoreReasonCodeValues,
  setLeadManualPriorityBoost,
} from "@/lib/scoring";
import type { AccountScoringInput, LeadScoringInput } from "@/lib/scoring/input-builders";

import { resetDatabase } from "./helpers/db";

before(async () => {
  await resetDatabase();
});

after(async () => {
  await resetDatabase();
});

const scoreReasonCodeSet = new Set(scoreReasonCodeValues);
const scoreComponentOrder = [...scoreComponentKeyValues];

test("threshold mapping and clamping follow the default deterministic rules", () => {
  assert.equal(clampTotalScore(-12), 0);
  assert.equal(clampTotalScore(109), 100);
  assert.equal(deriveTemperature(24, DEFAULT_SCORING_CONFIG.thresholds), Temperature.COLD);
  assert.equal(deriveTemperature(25, DEFAULT_SCORING_CONFIG.thresholds), Temperature.WARM);
  assert.equal(deriveTemperature(49, DEFAULT_SCORING_CONFIG.thresholds), Temperature.WARM);
  assert.equal(deriveTemperature(50, DEFAULT_SCORING_CONFIG.thresholds), Temperature.HOT);
  assert.equal(deriveTemperature(74, DEFAULT_SCORING_CONFIG.thresholds), Temperature.HOT);
  assert.equal(deriveTemperature(75, DEFAULT_SCORING_CONFIG.thresholds), Temperature.URGENT);
});

test("computeAccountScore caps final product-usage contributions deterministically", () => {
  const now = new Date("2026-03-26T16:00:00.000Z");
  const input: AccountScoringInput = {
    segment: "SMB",
    accountTier: "TIER_3",
    employeeCount: 120,
    annualRevenueBand: "$20M-$50M",
    hasNamedOwner: false,
    manualPriorityBoost: 0,
    signalMetrics: {
      lastSignalAt: null,
      pricingVisitCount7d: 0,
      highIntentClusterCount14d: 0,
      thirdPartyIntentCount30d: 0,
      websiteVisitCount14d: 0,
      webinarRegistrationCount30d: 0,
      formFillCount30d: 0,
      emailReplyCount30d: 0,
      meetingBookedCount30d: 0,
      meetingNoShowCount30d: 0,
      engagedContactCount30d: 0,
      productSignupCount30d: 1,
      teamInviteCount30d: 1,
      keyActivationCount30d: 1,
    },
  };

  const breakdown = computeAccountScore(
    input,
    {
      ...DEFAULT_SCORING_CONFIG,
      componentCaps: {
        ...DEFAULT_SCORING_CONFIG.componentCaps,
        productUsage: 13,
      },
    },
    now,
  );
  const productUsage = breakdown.componentBreakdown.find(
    (component) => component.key === "productUsage",
  );

  assert.ok(productUsage);
  assert.equal(productUsage.score, 13);
  assert.deepEqual(
    productUsage.contributors.map((contributor) => [contributor.reasonCode, contributor.points]),
    [
      ["product_usage_signup", 6],
      ["product_usage_team_invite", 4],
      ["product_usage_key_activation", 3],
    ],
  );
});

test("computeLeadScore caps final fit contributions deterministically", () => {
  const now = new Date("2026-03-26T16:00:00.000Z");
  const input: LeadScoringInput = {
    accountFitScore: 20,
    seniority: "VP, Revenue Operations",
    personaType: "RevOps",
    manualPriorityBoost: 0,
    directSignalMetrics: {
      lastSignalAt: null,
      pricingVisitCount7d: 0,
      highIntentClusterCount14d: 0,
      thirdPartyIntentCount30d: 0,
      websiteVisitCount14d: 0,
      webinarRegistrationCount30d: 0,
      formFillCount30d: 0,
      emailReplyCount30d: 0,
      meetingBookedCount30d: 0,
      meetingNoShowCount30d: 0,
      engagedContactCount30d: 0,
      productSignupCount30d: 0,
      teamInviteCount30d: 0,
      keyActivationCount30d: 0,
    },
    inheritedSignalMetrics: {
      lastSignalAt: null,
      pricingVisitCount7d: 0,
      highIntentClusterCount14d: 0,
      thirdPartyIntentCount30d: 0,
      websiteVisitCount14d: 0,
      webinarRegistrationCount30d: 0,
      formFillCount30d: 0,
      emailReplyCount30d: 0,
      meetingBookedCount30d: 0,
      meetingNoShowCount30d: 0,
      engagedContactCount30d: 0,
      productSignupCount30d: 0,
      teamInviteCount30d: 0,
      keyActivationCount30d: 0,
    },
  };

  const breakdown = computeLeadScore(
    input,
    {
      ...DEFAULT_SCORING_CONFIG,
      componentCaps: {
        ...DEFAULT_SCORING_CONFIG.componentCaps,
        fit: 18,
      },
    },
    now,
  );
  const fit = breakdown.componentBreakdown.find((component) => component.key === "fit");

  assert.ok(fit);
  assert.equal(fit.score, 18);
  assert.deepEqual(
    fit.contributors.map((contributor) => [contributor.reasonCode, contributor.points]),
    [
      ["fit_account_inheritance", 12],
      ["fit_seniority_vp", 4],
      ["fit_persona_ops", 2],
    ],
  );
});

test("computeAccountScore applies pricing, product usage, engagement, and manual priority deterministically", () => {
  const now = new Date("2026-03-26T16:00:00.000Z");
  const input: AccountScoringInput = {
    segment: "STRATEGIC",
    accountTier: "STRATEGIC",
    employeeCount: 4200,
    annualRevenueBand: "$500M+",
    hasNamedOwner: true,
    manualPriorityBoost: 3,
    signalMetrics: {
      lastSignalAt: new Date("2026-03-26T14:30:00.000Z"),
      pricingVisitCount7d: 3,
      highIntentClusterCount14d: 0,
      thirdPartyIntentCount30d: 0,
      websiteVisitCount14d: 0,
      webinarRegistrationCount30d: 0,
      formFillCount30d: 1,
      emailReplyCount30d: 1,
      meetingBookedCount30d: 1,
      meetingNoShowCount30d: 0,
      engagedContactCount30d: 2,
      productSignupCount30d: 1,
      teamInviteCount30d: 1,
      keyActivationCount30d: 1,
    },
  };

  const breakdown = computeAccountScore(input, DEFAULT_SCORING_CONFIG, now);

  assert.equal(breakdown.totalScore, 86);
  assert.equal(breakdown.temperature, Temperature.URGENT);
  assert.equal(breakdown.componentBreakdown.find((component) => component.key === "fit")?.score, 25);
  assert.equal(breakdown.componentBreakdown.find((component) => component.key === "intent")?.score, 8);
  assert.equal(breakdown.componentBreakdown.find((component) => component.key === "engagement")?.score, 25);
  assert.equal(breakdown.componentBreakdown.find((component) => component.key === "recency")?.score, 10);
  assert.equal(breakdown.componentBreakdown.find((component) => component.key === "productUsage")?.score, 15);
  assert.equal(breakdown.componentBreakdown.find((component) => component.key === "manualPriority")?.score, 3);
  assert.ok(
    breakdown.componentBreakdown.find((component) => component.key === "intent")?.reasonCodes.includes(
      "intent_pricing_page_cluster",
    ),
  );
  assert.ok(
    breakdown.componentBreakdown.find((component) => component.key === "productUsage")?.reasonCodes.includes(
      "product_usage_key_activation",
    ),
  );
  assert.ok(
    breakdown.componentBreakdown.find((component) => component.key === "manualPriority")?.reasonCodes.includes(
      "manual_priority_boost",
    ),
  );
});

test("computeLeadScore halves inherited account-only signal impact", () => {
  const now = new Date("2026-03-26T16:00:00.000Z");
  const input: LeadScoringInput = {
    accountFitScore: 25,
    seniority: "Director",
    personaType: "RevOps",
    manualPriorityBoost: 0,
    directSignalMetrics: {
      lastSignalAt: null,
      pricingVisitCount7d: 0,
      highIntentClusterCount14d: 0,
      thirdPartyIntentCount30d: 0,
      websiteVisitCount14d: 0,
      webinarRegistrationCount30d: 0,
      formFillCount30d: 0,
      emailReplyCount30d: 0,
      meetingBookedCount30d: 0,
      meetingNoShowCount30d: 0,
      engagedContactCount30d: 0,
      productSignupCount30d: 0,
      teamInviteCount30d: 0,
      keyActivationCount30d: 0,
    },
    inheritedSignalMetrics: {
      lastSignalAt: new Date("2026-03-26T14:00:00.000Z"),
      pricingVisitCount7d: 3,
      highIntentClusterCount14d: 0,
      thirdPartyIntentCount30d: 0,
      websiteVisitCount14d: 0,
      webinarRegistrationCount30d: 0,
      formFillCount30d: 0,
      emailReplyCount30d: 0,
      meetingBookedCount30d: 1,
      meetingNoShowCount30d: 0,
      engagedContactCount30d: 2,
      productSignupCount30d: 1,
      teamInviteCount30d: 0,
      keyActivationCount30d: 0,
    },
  };

  const breakdown = computeLeadScore(input, DEFAULT_SCORING_CONFIG, now);

  assert.equal(breakdown.componentBreakdown.find((component) => component.key === "fit")?.score, 23);
  assert.equal(breakdown.componentBreakdown.find((component) => component.key === "intent")?.score, 4);
  assert.equal(breakdown.componentBreakdown.find((component) => component.key === "engagement")?.score, 6);
  assert.equal(breakdown.componentBreakdown.find((component) => component.key === "recency")?.score, 5);
  assert.equal(breakdown.componentBreakdown.find((component) => component.key === "productUsage")?.score, 3);
  assert.equal(breakdown.totalScore, 41);
  assert.equal(breakdown.temperature, Temperature.WARM);
});

test("score reason details are stable, ordered, and display-ready", () => {
  const now = new Date("2026-03-26T16:00:00.000Z");
  const breakdown = computeAccountScore(
    {
      segment: "STRATEGIC",
      accountTier: "STRATEGIC",
      employeeCount: 4200,
      annualRevenueBand: "$500M+",
      hasNamedOwner: true,
      manualPriorityBoost: 5,
      signalMetrics: {
        lastSignalAt: new Date("2026-03-26T15:00:00.000Z"),
        pricingVisitCount7d: 3,
        highIntentClusterCount14d: 1,
        thirdPartyIntentCount30d: 1,
        websiteVisitCount14d: 5,
        webinarRegistrationCount30d: 1,
        formFillCount30d: 1,
        emailReplyCount30d: 1,
        meetingBookedCount30d: 1,
        meetingNoShowCount30d: 0,
        engagedContactCount30d: 2,
        productSignupCount30d: 1,
        teamInviteCount30d: 1,
        keyActivationCount30d: 1,
      },
    },
    DEFAULT_SCORING_CONFIG,
    now,
  );

  assert.deepEqual(
    breakdown.componentBreakdown.map((component) => component.key),
    scoreComponentOrder,
  );
  assert.equal(breakdown.reasonDetails.length, 5);
  assert.deepEqual(
    breakdown.reasonDetails.map((detail) => detail.code),
    [
      "fit_strategic_segment",
      "recency_event_within_24h",
      "intent_pricing_page_cluster",
      "engagement_form_fill",
      "engagement_meeting_booked",
    ],
  );
  assert.deepEqual(
    breakdown.topReasonCodes,
    breakdown.reasonDetails.map((detail) => detail.code),
  );

  for (const detail of breakdown.reasonDetails) {
    assert.ok(scoreReasonCodeSet.has(detail.code));
    assert.ok(detail.label.length > 0);
    assert.ok(detail.description.length > 0);
    assert.ok(detail.componentLabel.length > 0);
    assert.notEqual(detail.points, 0);
  }
});

test("matched signal ingest recomputes account and related lead snapshots with canonical persisted history", async () => {
  const primaryContact = await db.contact.findUniqueOrThrow({
    where: {
      id: "acc_beaconops_contact_01",
    },
    select: {
      email: true,
    },
  });
  const beforeAccount = await getAccountScoreBreakdown("acc_beaconops");
  const beforeLead = await getLeadScoreBreakdown("acc_beaconops_lead_01");
  const beforeRoutingCount = await db.routingDecision.count({
    where: {
      leadId: "acc_beaconops_lead_01",
    },
  });

  assert.ok(beforeAccount);
  assert.ok(beforeLead);

  const result = await ingestSignal({
    source_system: "product",
    event_type: "product_usage_milestone",
    account_domain: "beaconopspartners.com",
    contact_email: primaryContact.email,
    occurred_at: "2026-03-27T17:00:00.000Z",
    received_at: "2026-03-27T17:05:00.000Z",
    payload: {
      workspace_id: "test_scoring_workspace_1",
      milestone: "connected_crm",
      user_id: "test_scoring_user_1",
    },
  });

  assert.equal(result.status, SignalStatus.MATCHED);

  const afterAccount = await getAccountScoreBreakdown("acc_beaconops");
  const afterLead = await getLeadScoreBreakdown("acc_beaconops_lead_01");
  const afterRoutingCount = await db.routingDecision.count({
    where: {
      leadId: "acc_beaconops_lead_01",
    },
  });
  const persistedRoutingDecision = await db.routingDecision.findFirst({
    where: {
      leadId: "acc_beaconops_lead_01",
      triggerSignalId: result.signalId,
    },
    select: {
      triggerSignalId: true,
      slaTargetMinutes: true,
    },
  });
  const [accountHistory, leadHistory] = await Promise.all([
    getScoreHistoryForEntity(ScoreEntityType.ACCOUNT, "acc_beaconops", { limit: 8 }),
    getScoreHistoryForEntity(ScoreEntityType.LEAD, "acc_beaconops_lead_01", { limit: 8 }),
  ]);
  const triggeredHistoryRows = [
    accountHistory.rows.find((row) => row.trigger.signalSummary?.signalId === result.signalId),
    leadHistory.rows.find((row) => row.trigger.signalSummary?.signalId === result.signalId),
  ];

  assert.ok(afterAccount);
  assert.ok(afterLead);
  assert.ok(afterAccount.totalScore >= beforeAccount.totalScore);
  assert.ok(afterLead.totalScore >= beforeLead.totalScore);
  assert.notEqual(afterAccount.lastUpdatedAtIso, beforeAccount.lastUpdatedAtIso);
  assert.notEqual(afterLead.lastUpdatedAtIso, beforeLead.lastUpdatedAtIso);
  assert.ok(afterRoutingCount > beforeRoutingCount);
  assert.ok(persistedRoutingDecision);
  assert.equal(persistedRoutingDecision?.triggerSignalId, result.signalId);
  assert.equal(persistedRoutingDecision?.slaTargetMinutes, 240);
  assert.deepEqual(
    afterAccount.componentBreakdown.map((component) => component.key),
    scoreComponentOrder,
  );
  assert.deepEqual(
    afterLead.componentBreakdown.map((component) => component.key),
    scoreComponentOrder,
  );

  for (const historyRow of triggeredHistoryRows) {
    assert.ok(historyRow);
    assert.deepEqual(
      historyRow.componentBreakdown.map((component) => component.key),
      scoreComponentOrder,
    );
    assert.equal(historyRow.reasonCodes.length, new Set(historyRow.reasonCodes).size);
    assert.ok(historyRow.reasonDetails.length <= 5);
    assert.equal(historyRow.reasonDetails.length, new Set(historyRow.reasonDetails.map((detail) => detail.code)).size);
    assert.equal(historyRow.reasonDetails.every((detail) => scoreReasonCodeSet.has(detail.code)), true);
    assert.equal(
      historyRow.reasonDetails.every((detail) => historyRow.reasonCodes.includes(detail.code)),
      true,
    );
    assert.equal(historyRow.trigger.signalSummary?.signalId, result.signalId);
    assert.equal(historyRow.trigger.signalSummary?.eventType, "PRODUCT_USAGE_MILESTONE");
    assert.ok(historyRow.trigger.signalSummary?.payloadSummary);
  }
});

test("manual attachment rescues an unmatched signal and triggers rescoring", async () => {
  const unmatched = await ingestSignal({
    source_system: "marketing_automation",
    event_type: "form_fill",
    contact_email: "rescued.signal@unknown.example.com",
    occurred_at: "2026-03-27T18:00:00.000Z",
    received_at: "2026-03-27T18:05:00.000Z",
    payload: {
      form_id: "request_demo",
      submission_id: "rescued_signal_form_1",
    },
  });

  assert.equal(unmatched.status, SignalStatus.UNMATCHED);

  const beforeHistory = await db.scoreHistory.count({
    where: {
      entityType: ScoreEntityType.ACCOUNT,
      entityId: "acc_signalnest",
    },
  });
  const beforeRoutingCount = await db.routingDecision.count({
    where: {
      leadId: "acc_signalnest_lead_01",
    },
  });

  await attachSignal(unmatched.signalId, {
    accountId: "acc_signalnest",
    contactId: "acc_signalnest_contact_01",
    actorType: "user",
    actorName: "Test Operator",
    note: "Linked after operator review.",
  });

  const signal = await db.signalEvent.findUniqueOrThrow({
    where: {
      id: unmatched.signalId,
    },
    select: {
      status: true,
      accountId: true,
      contactId: true,
    },
  });
  const afterHistory = await db.scoreHistory.count({
    where: {
      entityType: ScoreEntityType.ACCOUNT,
      entityId: "acc_signalnest",
    },
  });
  const attachAudit = await db.auditLog.findFirst({
    where: {
      eventType: AuditEventType.SIGNAL_ATTACHED_AND_RESCORED,
      entityId: unmatched.signalId,
    },
  });
  const afterRoutingCount = await db.routingDecision.count({
    where: {
      leadId: "acc_signalnest_lead_01",
    },
  });
  const persistedRoutingDecision = await db.routingDecision.findFirst({
    where: {
      leadId: "acc_signalnest_lead_01",
      triggerSignalId: unmatched.signalId,
    },
    select: {
      triggerSignalId: true,
      slaTargetMinutes: true,
      assignedOwnerId: true,
    },
  });

  assert.equal(signal.status, SignalStatus.MATCHED);
  assert.equal(signal.accountId, "acc_signalnest");
  assert.equal(signal.contactId, "acc_signalnest_contact_01");
  assert.ok(afterHistory > beforeHistory);
  assert.ok(attachAudit);
  assert.ok(afterRoutingCount > beforeRoutingCount);
  assert.ok(persistedRoutingDecision);
  assert.equal(persistedRoutingDecision?.triggerSignalId, unmatched.signalId);
  assert.equal(persistedRoutingDecision?.slaTargetMinutes, 240);
  assert.equal(persistedRoutingDecision?.assignedOwnerId, "usr_owen_price");
});

test("manual priority overrides update the manual component and write audit history", async () => {
  const beforeHistory = await db.scoreHistory.count({
    where: {
      entityType: ScoreEntityType.LEAD,
      entityId: "acc_signalnest_lead_01",
    },
  });

  await setLeadManualPriorityBoost("acc_signalnest_lead_01", 5, {
    actorType: "user",
    actorName: "Test Operator",
    note: "Escalated for manual outreach.",
    effectiveAtIso: "2026-03-27T19:00:00.000Z",
  });

  const leadScore = await getLeadScoreBreakdown("acc_signalnest_lead_01");
  const afterHistory = await db.scoreHistory.count({
    where: {
      entityType: ScoreEntityType.LEAD,
      entityId: "acc_signalnest_lead_01",
    },
  });
  const auditLog = await db.auditLog.findFirst({
    where: {
      eventType: AuditEventType.SCORE_MANUAL_PRIORITY_OVERRIDDEN,
      entityId: "acc_signalnest_lead_01",
    },
  });

  assert.ok(leadScore);
  assert.equal(leadScore.componentBreakdown.find((component) => component.key === "manualPriority")?.score, 5);
  assert.ok(afterHistory > beforeHistory);
  assert.ok(auditLog);
});

test("signal-triggered score history keeps reason metadata unique, ordered, and display-ready", async () => {
  await resetDatabase();
  const primaryContact = await db.contact.findUniqueOrThrow({
    where: {
      id: "acc_beaconops_contact_01",
    },
    select: {
      email: true,
    },
  });
  const result = await ingestSignal({
    source_system: "product",
    event_type: "product_usage_milestone",
    account_domain: "beaconopspartners.com",
    contact_email: primaryContact.email,
    occurred_at: "2026-03-27T18:30:00.000Z",
    received_at: "2026-03-27T18:34:00.000Z",
    payload: {
      workspace_id: "test_reason_metadata_workspace_1",
      milestone: "connected_crm",
      user_id: "test_reason_metadata_user_1",
    },
  });
  const history = await getScoreHistoryForEntity(ScoreEntityType.LEAD, "acc_beaconops_lead_01", {
    limit: 8,
  });
  const triggeredRow = history.rows.find(
    (row) => row.trigger.signalSummary?.signalId === result.signalId,
  );

  assert.equal(result.status, SignalStatus.MATCHED);
  assert.ok(triggeredRow);
  assert.equal(triggeredRow?.reasonCodes.length, new Set(triggeredRow?.reasonCodes).size);
  assert.equal(
    triggeredRow?.reasonDetails.length,
    new Set(triggeredRow?.reasonDetails.map((detail) => detail.code)).size,
  );
  assert.equal(
    triggeredRow?.reasonDetails.every(
      (detail) =>
        triggeredRow.reasonCodes.includes(detail.code) &&
        scoreReasonCodeSet.has(detail.code) &&
        detail.label.length > 0 &&
        detail.description.length > 0,
    ),
    true,
  );
  for (let index = 1; index < (triggeredRow?.reasonDetails.length ?? 0); index += 1) {
    const previous = triggeredRow!.reasonDetails[index - 1]!;
    const current = triggeredRow!.reasonDetails[index]!;

    assert.ok(Math.abs(previous.points) >= Math.abs(current.points));
  }
});

test("no-op recompute does not create duplicate score history rows", async () => {
  const account = await db.account.findUniqueOrThrow({
    where: {
      id: "acc_summitflow_finance",
    },
    select: {
      scoreLastComputedAt: true,
    },
  });

  assert.ok(account.scoreLastComputedAt);

  const beforeHistory = await db.scoreHistory.count({
    where: {
      entityType: ScoreEntityType.ACCOUNT,
      entityId: "acc_summitflow_finance",
    },
  });

  await recomputeAccountScore("acc_summitflow_finance", {
    type: "MANUAL_RECOMPUTE",
    actorType: "system",
    actorName: "Test",
    effectiveAtIso: account.scoreLastComputedAt!.toISOString(),
    note: "Verify no-op recompute stability.",
  });

  const afterHistory = await db.scoreHistory.count({
    where: {
      entityType: ScoreEntityType.ACCOUNT,
      entityId: "acc_summitflow_finance",
    },
  });

  assert.equal(afterHistory, beforeHistory);
});
