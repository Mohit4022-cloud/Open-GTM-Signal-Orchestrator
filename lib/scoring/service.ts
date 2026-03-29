import { randomUUID } from "node:crypto";

import {
  LeadStatus,
  Prisma,
  ScoreEntityType,
  ScoreTriggerType,
  SignalStatus,
  type PrismaClient,
} from "@prisma/client";

import {
  recordScoreManualPriorityOverridden,
  recordScoreRecomputed,
  recordScoreThresholdCrossed,
  recordSignalAttachedAndRescored,
} from "@/lib/audit/scoring";
import type {
  EntityScoreBreakdownContract,
  ScoreComponentBreakdownContract,
  ScoreRecomputeTriggerContract,
} from "@/lib/contracts/scoring";
import { generateActionsForAccountWithClient } from "@/lib/actions";
import { db } from "@/lib/db";
import { stableStringify } from "@/lib/data/signals/shared";
import {
  buildAccountScoringInput,
  buildLeadScoringInput,
  computeAccountScore,
  computeLeadScore,
  getActiveScoringConfig,
} from "@/lib/scoring";
import { routeActiveLeadsForSignalWithClient } from "@/lib/routing";

type ScoringClient = Prisma.TransactionClient | PrismaClient;

type ManualPriorityActor = {
  actorType: string;
  actorName: string;
  note?: string | null;
  effectiveAtIso?: string | null;
};

function getSignalFactSelect() {
  return {
    id: true,
    eventType: true,
    occurredAt: true,
    contactId: true,
    leadId: true,
    normalizedPayloadJson: true,
    payloadSummary: true,
  } as const;
}

function resolveEffectiveAt(
  trigger: Pick<ScoreRecomputeTriggerContract, "effectiveAtIso"> | undefined,
  fallback: Date,
) {
  if (!trigger?.effectiveAtIso) {
    return fallback;
  }

  const parsed = new Date(trigger.effectiveAtIso);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function resolveTrigger(
  trigger: ScoreRecomputeTriggerContract | undefined,
  fallbackType: ScoreTriggerType,
  fallbackSignalId: string | null,
  fallbackEffectiveAt: Date,
): {
  type: ScoreTriggerType;
  signalId: string | null;
  effectiveAtIso: string;
  actorType?: string;
  actorName?: string;
  note?: string;
  metadata?: Record<string, unknown> | null;
} {
  return {
    type: trigger?.type ?? fallbackType,
    signalId: trigger?.signalId ?? fallbackSignalId,
    effectiveAtIso: resolveEffectiveAt(trigger, fallbackEffectiveAt).toISOString(),
    actorType: trigger?.actorType,
    actorName: trigger?.actorName,
    note: trigger?.note,
    metadata: trigger?.metadata ?? null,
  };
}

function getAllReasonCodes(componentBreakdown: ScoreComponentBreakdownContract[]) {
  return [...new Set(componentBreakdown.flatMap((component) => component.reasonCodes))];
}

function getComponentScore(componentBreakdown: ScoreComponentBreakdownContract[], key: string) {
  return componentBreakdown.find((component) => component.key === key)?.score ?? 0;
}

function toJsonValue(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function deriveLeadStatus(temperature: EntityScoreBreakdownContract["temperature"]) {
  switch (temperature) {
    case "URGENT":
      return LeadStatus.QUALIFIED;
    case "HOT":
      return LeadStatus.WORKING;
    case "WARM":
      return LeadStatus.NEW;
    case "COLD":
      return LeadStatus.NURTURING;
  }
}

function hasMaterialScoreChange(
  currentScore: number,
  currentTemperature: string,
  currentBreakdown: unknown,
  currentReasonCodes: unknown,
  nextScore: EntityScoreBreakdownContract,
) {
  return (
    currentScore !== nextScore.totalScore ||
    currentTemperature !== nextScore.temperature ||
    stableStringify(currentBreakdown) !== stableStringify(nextScore.componentBreakdown) ||
    stableStringify(currentReasonCodes) !== stableStringify(getAllReasonCodes(nextScore.componentBreakdown))
  );
}

async function loadAccountSignals(client: ScoringClient, accountId: string) {
  return client.signalEvent.findMany({
    where: {
      accountId,
      status: SignalStatus.MATCHED,
    },
    orderBy: {
      occurredAt: "desc",
    },
    select: getSignalFactSelect(),
  });
}

async function recomputeAccountScoreWithClient(
  client: ScoringClient,
  accountId: string,
  trigger?: ScoreRecomputeTriggerContract,
) {
  const [config, account, signals] = await Promise.all([
    getActiveScoringConfig(client),
    client.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        segment: true,
        accountTier: true,
        employeeCount: true,
        annualRevenueBand: true,
        namedOwnerId: true,
        manualPriorityBoost: true,
        fitScore: true,
        overallScore: true,
        temperature: true,
        scoreBreakdownJson: true,
        scoreReasonCodesJson: true,
        scoreExplanationJson: true,
        scoreLastComputedAt: true,
        scoringVersion: true,
      },
    }),
    loadAccountSignals(client, accountId),
  ]);

  if (!account) {
    return null;
  }

  const resolvedTrigger = resolveTrigger(
    trigger,
    ScoreTriggerType.MANUAL_RECOMPUTE,
    trigger?.signalId ?? null,
    new Date(),
  );
  const effectiveAt = new Date(resolvedTrigger.effectiveAtIso);
  const input = buildAccountScoringInput({
    segment: account.segment,
    accountTier: account.accountTier,
    employeeCount: account.employeeCount,
    annualRevenueBand: account.annualRevenueBand,
    namedOwnerId: account.namedOwnerId,
    manualPriorityBoost: account.manualPriorityBoost,
    signals,
    now: effectiveAt,
  });
  const nextScore = computeAccountScore(input, config, effectiveAt);
  const nextReasonCodes = getAllReasonCodes(nextScore.componentBreakdown);
  const materialChange = hasMaterialScoreChange(
    account.overallScore,
    account.temperature,
    account.scoreBreakdownJson,
    account.scoreReasonCodesJson,
    nextScore,
  );

  await client.account.update({
    where: { id: account.id },
    data: {
      fitScore: getComponentScore(nextScore.componentBreakdown, "fit"),
      intentScore: getComponentScore(nextScore.componentBreakdown, "intent"),
      engagementScore: getComponentScore(nextScore.componentBreakdown, "engagement"),
      recencyScore: getComponentScore(nextScore.componentBreakdown, "recency"),
      productUsageScore: getComponentScore(nextScore.componentBreakdown, "productUsage"),
      manualPriorityScore: getComponentScore(nextScore.componentBreakdown, "manualPriority"),
      overallScore: nextScore.totalScore,
      temperature: nextScore.temperature,
      scoreBreakdownJson: toJsonValue(nextScore.componentBreakdown),
      scoreReasonCodesJson: toJsonValue(nextReasonCodes),
      scoreExplanationJson: toJsonValue(nextScore.explanation),
      scoreLastComputedAt: effectiveAt,
      scoringVersion: nextScore.scoringVersion,
    },
  });

  if (materialChange) {
    await client.scoreHistory.create({
      data: {
        id: randomUUID(),
        entityType: ScoreEntityType.ACCOUNT,
        entityId: account.id,
        accountId: account.id,
        leadId: null,
        previousScore: account.overallScore,
        newScore: nextScore.totalScore,
        delta: nextScore.totalScore - account.overallScore,
        previousTemperature: account.temperature,
        newTemperature: nextScore.temperature,
        componentBreakdownJson: toJsonValue(nextScore.componentBreakdown),
        reasonCodesJson: toJsonValue(nextReasonCodes),
        explanationJson: toJsonValue(nextScore.explanation),
        triggerType: resolvedTrigger.type,
        triggerSignalId: resolvedTrigger.signalId,
        triggerMetadataJson: resolvedTrigger.metadata ? toJsonValue(resolvedTrigger.metadata) : undefined,
        scoringVersion: nextScore.scoringVersion,
        createdAt: effectiveAt,
      },
    });
  }

  await recordScoreRecomputed(client, {
    entityType: "account",
    entityId: account.id,
    accountId: account.id,
    explanation: nextScore.explanation.summary,
    reasonCodes: nextReasonCodes,
    beforeState: {
      totalScore: account.overallScore,
      temperature: account.temperature,
      scoringVersion: account.scoringVersion,
    },
    afterState: {
      totalScore: nextScore.totalScore,
      temperature: nextScore.temperature,
      reasonCodes: nextReasonCodes,
      scoringVersion: nextScore.scoringVersion,
    },
  });

  if (materialChange && account.temperature !== nextScore.temperature) {
    await recordScoreThresholdCrossed(client, {
      entityType: "account",
      entityId: account.id,
      accountId: account.id,
      previousTemperature: account.temperature,
      newTemperature: nextScore.temperature,
      newScore: nextScore.totalScore,
      reasonCodes: nextReasonCodes,
    });
  }

  return nextScore;
}

async function recomputeLeadScoreWithClient(
  client: ScoringClient,
  leadId: string,
  trigger?: ScoreRecomputeTriggerContract,
) {
  const [config, lead] = await Promise.all([
    getActiveScoringConfig(client),
    client.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        accountId: true,
        contactId: true,
        status: true,
        score: true,
        temperature: true,
        manualPriorityBoost: true,
        scoreBreakdownJson: true,
        scoreReasonCodesJson: true,
        scoreExplanationJson: true,
        scoringVersion: true,
        contact: {
          select: {
            seniority: true,
            personaType: true,
          },
        },
        account: {
          select: {
            id: true,
            segment: true,
            accountTier: true,
            employeeCount: true,
            annualRevenueBand: true,
            namedOwnerId: true,
            manualPriorityBoost: true,
          },
        },
      },
    }),
  ]);

  if (!lead || !lead.account) {
    return null;
  }

  const signals = await loadAccountSignals(client, lead.accountId);
  const resolvedTrigger = resolveTrigger(
    trigger,
    ScoreTriggerType.MANUAL_RECOMPUTE,
    trigger?.signalId ?? null,
    new Date(),
  );
  const effectiveAt = new Date(resolvedTrigger.effectiveAtIso);
  const accountScore = computeAccountScore(
    buildAccountScoringInput({
      segment: lead.account.segment,
      accountTier: lead.account.accountTier,
      employeeCount: lead.account.employeeCount,
      annualRevenueBand: lead.account.annualRevenueBand,
      namedOwnerId: lead.account.namedOwnerId,
      manualPriorityBoost: lead.account.manualPriorityBoost,
      signals,
      now: effectiveAt,
    }),
    config,
    effectiveAt,
  );
  const nextScore = computeLeadScore(
    buildLeadScoringInput({
      accountFitScore: getComponentScore(accountScore.componentBreakdown, "fit"),
      seniority: lead.contact?.seniority ?? "",
      personaType: lead.contact?.personaType ?? "",
      contactId: lead.contactId,
      leadId: lead.id,
      manualPriorityBoost: lead.manualPriorityBoost,
      signals,
      now: effectiveAt,
    }),
    config,
    effectiveAt,
  );
  const nextReasonCodes = getAllReasonCodes(nextScore.componentBreakdown);
  const nextStatus = deriveLeadStatus(nextScore.temperature);
  const materialChange = hasMaterialScoreChange(
    lead.score,
    lead.temperature,
    lead.scoreBreakdownJson,
    lead.scoreReasonCodesJson,
    nextScore,
  );

  await client.lead.update({
    where: { id: lead.id },
    data: {
      status: nextStatus,
      fitScore: getComponentScore(nextScore.componentBreakdown, "fit"),
      intentScore: getComponentScore(nextScore.componentBreakdown, "intent"),
      engagementScore: getComponentScore(nextScore.componentBreakdown, "engagement"),
      recencyScore: getComponentScore(nextScore.componentBreakdown, "recency"),
      productUsageScore: getComponentScore(nextScore.componentBreakdown, "productUsage"),
      manualPriorityScore: getComponentScore(nextScore.componentBreakdown, "manualPriority"),
      score: nextScore.totalScore,
      temperature: nextScore.temperature,
      scoreBreakdownJson: toJsonValue(nextScore.componentBreakdown),
      scoreReasonCodesJson: toJsonValue(nextReasonCodes),
      scoreExplanationJson: toJsonValue(nextScore.explanation),
      scoreLastComputedAt: effectiveAt,
      scoringVersion: nextScore.scoringVersion,
    },
  });

  if (materialChange) {
    await client.scoreHistory.create({
      data: {
        id: randomUUID(),
        entityType: ScoreEntityType.LEAD,
        entityId: lead.id,
        accountId: lead.accountId,
        leadId: lead.id,
        previousScore: lead.score,
        newScore: nextScore.totalScore,
        delta: nextScore.totalScore - lead.score,
        previousTemperature: lead.temperature,
        newTemperature: nextScore.temperature,
        componentBreakdownJson: toJsonValue(nextScore.componentBreakdown),
        reasonCodesJson: toJsonValue(nextReasonCodes),
        explanationJson: toJsonValue(nextScore.explanation),
        triggerType: resolvedTrigger.type,
        triggerSignalId: resolvedTrigger.signalId,
        triggerMetadataJson: resolvedTrigger.metadata ? toJsonValue(resolvedTrigger.metadata) : undefined,
        scoringVersion: nextScore.scoringVersion,
        createdAt: effectiveAt,
      },
    });
  }

  await recordScoreRecomputed(client, {
    entityType: "lead",
    entityId: lead.id,
    accountId: lead.accountId,
    leadId: lead.id,
    explanation: nextScore.explanation.summary,
    reasonCodes: nextReasonCodes,
    beforeState: {
      totalScore: lead.score,
      temperature: lead.temperature,
      status: lead.status,
      scoringVersion: lead.scoringVersion,
    },
    afterState: {
      totalScore: nextScore.totalScore,
      temperature: nextScore.temperature,
      status: nextStatus,
      reasonCodes: nextReasonCodes,
      scoringVersion: nextScore.scoringVersion,
    },
  });

  if (materialChange && lead.temperature !== nextScore.temperature) {
    await recordScoreThresholdCrossed(client, {
      entityType: "lead",
      entityId: lead.id,
      accountId: lead.accountId,
      leadId: lead.id,
      previousTemperature: lead.temperature,
      newTemperature: nextScore.temperature,
      newScore: nextScore.totalScore,
      reasonCodes: nextReasonCodes,
    });
  }

  return nextScore;
}

async function recomputeScoresForSignalWithClient(
  client: ScoringClient,
  signalId: string,
  trigger?: ScoreRecomputeTriggerContract,
) {
  const signal = await client.signalEvent.findUnique({
    where: { id: signalId },
    select: {
      id: true,
      accountId: true,
      status: true,
      occurredAt: true,
      receivedAt: true,
    },
  });

  if (!signal || signal.status !== SignalStatus.MATCHED || !signal.accountId) {
    return {
      account: null,
      leads: [],
    };
  }

  const resolvedTrigger = resolveTrigger(trigger, ScoreTriggerType.SIGNAL_INGESTED, signal.id, signal.receivedAt);
  const accountScore = await recomputeAccountScoreWithClient(client, signal.accountId, resolvedTrigger);
  if (accountScore) {
    await generateActionsForAccountWithClient(client, signal.accountId, {
      effectiveAt: signal.receivedAt,
      triggerSignalId: signal.id,
    });
  }
  const leads = await client.lead.findMany({
    where: {
      accountId: signal.accountId,
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const recomputedLeads = [];
  for (const lead of leads) {
    const leadScore = await recomputeLeadScoreWithClient(client, lead.id, resolvedTrigger);
    if (leadScore) {
      recomputedLeads.push({
        leadId: lead.id,
        breakdown: leadScore,
      });
    }
  }

  return {
    account: accountScore,
    leads: recomputedLeads,
  };
}

export async function recomputeAccountScore(accountId: string, trigger?: ScoreRecomputeTriggerContract) {
  return db.$transaction((tx) => recomputeAccountScoreWithClient(tx, accountId, trigger));
}

export async function recomputeLeadScore(leadId: string, trigger?: ScoreRecomputeTriggerContract) {
  return db.$transaction((tx) => recomputeLeadScoreWithClient(tx, leadId, trigger));
}

export async function recomputeScoresForSignal(signalId: string, trigger?: ScoreRecomputeTriggerContract) {
  return db.$transaction((tx) => recomputeScoresForSignalWithClient(tx, signalId, trigger));
}

export async function attachSignalToEntities(
  signalId: string,
  params: {
    accountId: string;
    contactId?: string | null;
    leadId?: string | null;
    actorType?: string;
    actorName?: string;
    note?: string;
  },
) {
  return db.$transaction(async (tx) => {
    const signal = await tx.signalEvent.findUnique({
      where: { id: signalId },
      select: {
        id: true,
        status: true,
        accountId: true,
        contactId: true,
        leadId: true,
      },
    });

    if (!signal) {
      return null;
    }

    await tx.signalEvent.update({
      where: { id: signalId },
      data: {
        status: SignalStatus.MATCHED,
        accountId: params.accountId,
        contactId: params.contactId ?? null,
        leadId: params.leadId ?? null,
      },
    });

    await recordSignalAttachedAndRescored(tx, {
      signalId,
      accountId: params.accountId,
      leadId: params.leadId ?? null,
      explanation:
        params.note?.trim()
          ? `Previously unmatched signal was manually attached and rescored. ${params.note.trim()}`
          : "Previously unmatched signal was manually attached and rescored.",
      reasonCodes: [],
      beforeState: {
        status: signal.status,
        accountId: signal.accountId,
        contactId: signal.contactId,
        leadId: signal.leadId,
      },
      afterState: {
        status: SignalStatus.MATCHED,
        accountId: params.accountId,
        contactId: params.contactId ?? null,
        leadId: params.leadId ?? null,
      },
    });

    const recomputeResult = await recomputeScoresForSignalWithClient(tx, signalId, {
      type: ScoreTriggerType.SIGNAL_ATTACHED,
      signalId,
      actorType: params.actorType,
      actorName: params.actorName,
      note: params.note,
      metadata: {
        accountId: params.accountId,
        contactId: params.contactId ?? null,
        leadId: params.leadId ?? null,
      },
    });
    await routeActiveLeadsForSignalWithClient(tx, signalId);
    return recomputeResult;
  });
}

export async function setAccountManualPriorityBoost(
  accountId: string,
  boost: number,
  actor: ManualPriorityActor,
) {
  return db.$transaction(async (tx) => {
    const account = await tx.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        manualPriorityBoost: true,
      },
    });

    if (!account) {
      return null;
    }

    const nextBoost = Math.max(0, Math.min(5, Math.round(boost)));
    const effectiveAt = resolveEffectiveAt(
      actor.effectiveAtIso ? { effectiveAtIso: actor.effectiveAtIso } : undefined,
      new Date(),
    );
    await tx.account.update({
      where: { id: accountId },
      data: {
        manualPriorityBoost: nextBoost,
        manualPriorityNote: actor.note ?? null,
        manualPriorityUpdatedAt: effectiveAt,
      },
    });

    await recordScoreManualPriorityOverridden(tx, {
      entityType: "account",
      entityId: accountId,
      accountId,
      actorType: actor.actorType,
      actorName: actor.actorName,
      previousBoost: account.manualPriorityBoost,
      newBoost: nextBoost,
      note: actor.note,
    });

    return recomputeAccountScoreWithClient(tx, accountId, {
      type: ScoreTriggerType.MANUAL_PRIORITY_CHANGED,
      actorType: actor.actorType,
      actorName: actor.actorName,
      effectiveAtIso: effectiveAt.toISOString(),
      note: actor.note ?? undefined,
      metadata: {
        previousBoost: account.manualPriorityBoost,
        newBoost: nextBoost,
      },
    });
  });
}

export async function setLeadManualPriorityBoost(
  leadId: string,
  boost: number,
  actor: ManualPriorityActor,
) {
  return db.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        accountId: true,
        manualPriorityBoost: true,
      },
    });

    if (!lead) {
      return null;
    }

    const nextBoost = Math.max(0, Math.min(5, Math.round(boost)));
    const effectiveAt = resolveEffectiveAt(
      actor.effectiveAtIso ? { effectiveAtIso: actor.effectiveAtIso } : undefined,
      new Date(),
    );
    await tx.lead.update({
      where: { id: leadId },
      data: {
        manualPriorityBoost: nextBoost,
        manualPriorityNote: actor.note ?? null,
        manualPriorityUpdatedAt: effectiveAt,
      },
    });

    await recordScoreManualPriorityOverridden(tx, {
      entityType: "lead",
      entityId: leadId,
      accountId: lead.accountId,
      leadId,
      actorType: actor.actorType,
      actorName: actor.actorName,
      previousBoost: lead.manualPriorityBoost,
      newBoost: nextBoost,
      note: actor.note,
    });

    return recomputeLeadScoreWithClient(tx, leadId, {
      type: ScoreTriggerType.MANUAL_PRIORITY_CHANGED,
      actorType: actor.actorType,
      actorName: actor.actorName,
      effectiveAtIso: effectiveAt.toISOString(),
      note: actor.note ?? undefined,
      metadata: {
        previousBoost: lead.manualPriorityBoost,
        newBoost: nextBoost,
      },
    });
  });
}

export { recomputeScoresForSignalWithClient };
