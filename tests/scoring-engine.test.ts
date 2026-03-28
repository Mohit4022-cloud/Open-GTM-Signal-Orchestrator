import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { AuditEventType, ScoreEntityType, SignalStatus, Temperature } from "@prisma/client";

import { attachSignal, ingestSignal } from "@/lib/data/signals";
import { db } from "@/lib/db";
import {
  DEFAULT_SCORING_CONFIG,
  computeAccountScore,
  computeLeadScore,
  deriveTemperature,
  clampTotalScore,
  getAccountScoreBreakdown,
  getLeadScoreBreakdown,
  recomputeAccountScore,
  setLeadManualPriorityBoost,
} from "@/lib/scoring";
import type { AccountScoringInput, LeadScoringInput } from "@/lib/scoring/input-builders";

import { resetDatabase } from "./helpers/db";

before(() => {
  resetDatabase();
});

after(() => {
  resetDatabase();
});

test("threshold mapping and clamping follow the default deterministic rules", () => {
  assert.equal(clampTotalScore(-12), 0);
  assert.equal(clampTotalScore(109), 100);
  assert.equal(deriveTemperature(24, DEFAULT_SCORING_CONFIG.thresholds), Temperature.COLD);
  assert.equal(deriveTemperature(25, DEFAULT_SCORING_CONFIG.thresholds), Temperature.WARM);
  assert.equal(deriveTemperature(50, DEFAULT_SCORING_CONFIG.thresholds), Temperature.HOT);
  assert.equal(deriveTemperature(75, DEFAULT_SCORING_CONFIG.thresholds), Temperature.URGENT);
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

test("matched signal ingest recomputes account and related lead snapshots", async () => {
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
  const latestRoutingDecision = await db.routingDecision.findFirst({
    where: {
      leadId: "acc_beaconops_lead_01",
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      triggerSignalId: true,
      slaTargetMinutes: true,
    },
  });

  assert.ok(afterAccount);
  assert.ok(afterLead);
  assert.ok(afterAccount.totalScore >= beforeAccount.totalScore);
  assert.ok(afterLead.totalScore >= beforeLead.totalScore);
  assert.notEqual(afterAccount.lastUpdatedAtIso, beforeAccount.lastUpdatedAtIso);
  assert.notEqual(afterLead.lastUpdatedAtIso, beforeLead.lastUpdatedAtIso);
  assert.ok(afterRoutingCount > beforeRoutingCount);
  assert.equal(latestRoutingDecision?.triggerSignalId, result.signalId);
  assert.equal(latestRoutingDecision?.slaTargetMinutes, 240);
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
  const latestRoutingDecision = await db.routingDecision.findFirst({
    where: {
      leadId: "acc_signalnest_lead_01",
    },
    orderBy: {
      createdAt: "desc",
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
  assert.equal(latestRoutingDecision?.triggerSignalId, unmatched.signalId);
  assert.equal(latestRoutingDecision?.slaTargetMinutes, 1440);
  assert.equal(latestRoutingDecision?.assignedOwnerId, "usr_owen_price");
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
