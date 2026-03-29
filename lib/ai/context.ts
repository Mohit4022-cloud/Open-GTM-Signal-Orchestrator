import { db } from "@/lib/db";
import { getTasksForAccount, getTasksForLead } from "@/lib/actions";
import { getAccountById } from "@/lib/queries/accounts";
import { getLeadById } from "@/lib/queries/leads";
import { getLeadScoreBreakdown } from "@/lib/scoring";
import { getRoutingDecisionsForEntity } from "@/lib/routing";
import {
  type AccountSummaryRequest,
  type AccountSummarySourceSummaryContract,
  type ActionNoteRequest,
  type ActionNoteSourceSummaryContract,
} from "@/lib/contracts/ai";
import { formatEnumLabel } from "@/lib/formatters/display";

import { humanizeCode, isSlaRiskState } from "./shared";

type AccountPromptSignal = {
  eventType: string;
  occurredAtIso: string;
  description: string;
};

type AccountPromptTask = {
  title: string;
  priority: string;
  status: string;
  dueAtIso: string;
  ownerName: string | null;
  slaState: string;
  reason: string;
};

type AccountPromptAudit = {
  action: string;
  explanation: string;
  timestampIso: string;
};

export type AccountSummaryAiContext = {
  accountId: string;
  accountName: string;
  requestedMode: NonNullable<AccountSummaryRequest["mode"]>;
  requestedLength: NonNullable<AccountSummaryRequest["length"]>;
  promptContext: {
    account: {
      name: string;
      domain: string;
      segment: string;
      geography: string;
      lifecycleStage: string;
      status: string;
      tier: string;
      namedOwner: string | null;
    };
    score: {
      totalScore: number;
      fitScore: number;
      temperature: string;
      scoringVersion: string;
      summary: string;
      drivers: string[];
      cautions: string[];
      topReasonCodes: string[];
    };
    recentSignals: AccountPromptSignal[];
    openTasks: AccountPromptTask[];
    leadSnapshot: {
      relatedLeadCount: number;
      hotLeadCount: number;
      slaRiskLeadCount: number;
    };
    routing: {
      currentQueue: string | null;
      ownerName: string | null;
      summary: string | null;
    };
    auditHighlights: AccountPromptAudit[];
    hasSlaRisk: boolean;
    instructions: {
      mode: NonNullable<AccountSummaryRequest["mode"]>;
      length: NonNullable<AccountSummaryRequest["length"]>;
    };
  };
  fallbackSummary: string;
  fallbackKeyDrivers: string[];
  sourceSummary: AccountSummarySourceSummaryContract;
};

type LeadPromptSignal = {
  eventType: string;
  sourceSystem: string;
  occurredAtIso: string;
  payloadSummary: string;
};

type LeadPromptTask = {
  title: string;
  priority: string;
  status: string;
  dueAtIso: string;
  ownerName: string | null;
  slaState: string;
};

export type ActionNoteAiContext = {
  leadId: string;
  accountId: string;
  accountName: string;
  requestedMode: NonNullable<ActionNoteRequest["mode"]>;
  requestedLength: NonNullable<ActionNoteRequest["length"]>;
  promptContext: {
    lead: {
      id: string;
      accountName: string;
      contactName: string | null;
      source: string;
      inboundType: string;
      status: string;
      temperature: string;
      currentOwnerName: string | null;
    };
    score: {
      totalScore: number;
      temperature: string;
      summary: string;
      drivers: string[];
      topReasonCodes: string[];
    };
    recentSignals: LeadPromptSignal[];
    openTasks: LeadPromptTask[];
    routing: {
      currentQueue: string | null;
      ownerName: string | null;
      summary: string | null;
    };
    sla: {
      currentState: string;
      explanation: string;
      dueAtIso: string | null;
      firstResponseAtIso: string | null;
    };
    accountContext: {
      temperature: string | null;
      namedOwner: string | null;
    };
    instructions: {
      mode: NonNullable<ActionNoteRequest["mode"]>;
      length: NonNullable<ActionNoteRequest["length"]>;
    };
  };
  fallbackNote: string;
  fallbackSuggestedAngle: string;
  sourceSummary: ActionNoteSourceSummaryContract;
};

function getDefaultAccountMode(mode: AccountSummaryRequest["mode"]) {
  return mode ?? "default";
}

function getDefaultActionMode(mode: ActionNoteRequest["mode"]) {
  return mode ?? "default";
}

function getDefaultLength(length: AccountSummaryRequest["length"] | ActionNoteRequest["length"]) {
  return length ?? "medium";
}

function getTopReasonLabel(reasonCodes: string[]) {
  return humanizeCode(reasonCodes[0] ?? "recent signal activity");
}

function buildAccountFallbackSummary(params: {
  baseSummary: string;
  routingQueue: string | null;
  routingOwnerName: string | null;
  hasSlaRisk: boolean;
}) {
  const sentences = [params.baseSummary.trim()];

  if (params.routingQueue) {
    sentences.push(
      params.routingOwnerName
        ? `Current routing is ${params.routingQueue} with ${params.routingOwnerName}.`
        : `Current routing is ${params.routingQueue}.`,
    );
  }

  if (params.hasSlaRisk) {
    sentences.push("At least one related lead or task is approaching or past its SLA target.");
  }

  return sentences.join(" ").trim();
}

function buildAccountFallbackKeyDrivers(params: {
  scoreDrivers: string[];
  recentSignals: AccountPromptSignal[];
  openTasks: AccountPromptTask[];
  routingQueue: string | null;
  hasSlaRisk: boolean;
}) {
  const drivers = [...params.scoreDrivers.slice(0, 2)];
  const latestSignal = params.recentSignals[0];
  const topTask = params.openTasks[0];

  if (latestSignal) {
    drivers.push(`${latestSignal.eventType} is the most recent account signal.`);
  }

  if (topTask) {
    drivers.push(`Open task: ${topTask.title} (${topTask.priority.toLowerCase()} priority).`);
  } else if (params.routingQueue) {
    drivers.push(`Latest routing queue: ${params.routingQueue}.`);
  }

  if (params.hasSlaRisk) {
    drivers.push("An active SLA risk is present on a related lead or open task.");
  }

  return [...new Set(drivers.map((driver) => driver.trim()).filter(Boolean))].slice(0, 4);
}

function buildLeadFallbackNote(params: {
  accountName: string;
  contactName: string | null;
  primarySignal: LeadPromptSignal | undefined;
  topReasonLabel: string;
  routingQueue: string | null;
  routingOwnerName: string | null;
}) {
  const contact = params.contactName ?? "the active contact";
  const opener = params.primarySignal
    ? `Lead with the recent ${params.primarySignal.eventType.toLowerCase()} from ${contact}`
    : `Lead with the recent account activity from ${contact}`;
  const routing = params.routingOwnerName
    ? `Keep the follow-up aligned with ${params.routingOwnerName} in ${params.routingQueue ?? "the current queue"}.`
    : params.routingQueue
      ? `Keep the follow-up aligned with ${params.routingQueue}.`
      : "Keep the next step aligned with the current deterministic workflow.";

  return `${opener} at ${params.accountName}. Tie the conversation to ${params.topReasonLabel.toLowerCase()} and ask for a concrete next step. ${routing}`;
}

function buildLeadSuggestedAngle(params: {
  accountName: string;
  temperature: string;
  topReasonLabel: string;
  primarySignal: LeadPromptSignal | undefined;
}) {
  const signalPhrase = params.primarySignal
    ? `recent ${params.primarySignal.eventType.toLowerCase()}`
    : "recent signal activity";

  return `${params.accountName} is ${params.temperature.toLowerCase()} because of ${params.topReasonLabel.toLowerCase()} and ${signalPhrase}.`;
}

async function getLeadSignalsForPrompt(leadId: string, accountId: string) {
  const signals = await db.signalEvent.findMany({
    where: {
      OR: [
        { leadId },
        {
          leadId: null,
          accountId,
        },
      ],
    },
    orderBy: [{ occurredAt: "desc" }, { receivedAt: "desc" }, { id: "desc" }],
    take: 5,
    select: {
      eventType: true,
      sourceSystem: true,
      occurredAt: true,
      payloadSummary: true,
    },
  });

  return signals.map<LeadPromptSignal>((signal) => ({
    eventType: formatEnumLabel(signal.eventType),
    sourceSystem: formatEnumLabel(signal.sourceSystem),
    occurredAtIso: signal.occurredAt.toISOString(),
    payloadSummary: signal.payloadSummary,
  }));
}

export async function buildAccountSummaryContext(
  accountId: string,
  options: AccountSummaryRequest = {},
): Promise<AccountSummaryAiContext | null> {
  const [account, routingDecisions, taskQueue] = await Promise.all([
    getAccountById(accountId),
    getRoutingDecisionsForEntity("account", accountId),
    getTasksForAccount(accountId),
  ]);

  if (!account) {
    return null;
  }

  const requestedMode = getDefaultAccountMode(options.mode);
  const requestedLength = getDefaultLength(options.length);
  const latestRouting = routingDecisions[0] ?? null;
  const recentSignals = account.recentSignals.slice(0, 5).map<AccountPromptSignal>((signal) => ({
    eventType: signal.eventTypeLabel,
    occurredAtIso: signal.occurredAtIso,
    description: signal.description,
  }));
  const openTasks = taskQueue.slice(0, 3).map<AccountPromptTask>((task) => ({
    title: task.title,
    priority: task.priorityLabel,
    status: task.status,
    dueAtIso: task.dueAtIso,
    ownerName: task.owner?.name ?? null,
    slaState: task.sla.currentState,
    reason: task.reasonSummary.summary,
  }));
  const auditHighlights = account.auditLog.slice(0, 3).map<AccountPromptAudit>((entry) => ({
    action: entry.action,
    explanation: entry.explanation,
    timestampIso: entry.timestampIso,
  }));
  const slaRiskLeadCount = account.relatedLeads.filter((lead) => isSlaRiskState(lead.sla.currentState)).length;
  const hasSlaRisk =
    slaRiskLeadCount > 0 ||
    taskQueue.some((task) => isSlaRiskState(task.sla.currentState));

  const routingStatus = {
    currentQueue: latestRouting?.assignedQueue ?? null,
    ownerName: latestRouting?.assignedOwner?.name ?? account.namedOwner?.name ?? null,
  };

  const fallbackKeyDrivers = buildAccountFallbackKeyDrivers({
    scoreDrivers: account.score.explanation.drivers,
    recentSignals,
    openTasks,
    routingQueue: routingStatus.currentQueue,
    hasSlaRisk,
  });

  return {
    accountId,
    accountName: account.metadata.name,
    requestedMode,
    requestedLength,
    promptContext: {
      account: {
        name: account.metadata.name,
        domain: account.metadata.domain,
        segment: account.metadata.segmentLabel,
        geography: account.metadata.geographyLabel,
        lifecycleStage: account.metadata.lifecycleStageLabel,
        status: account.metadata.statusLabel,
        tier: account.metadata.tierLabel,
        namedOwner: account.namedOwner?.name ?? null,
      },
      score: {
        totalScore: account.metadata.overallScore,
        fitScore: account.metadata.fitScore,
        temperature: account.metadata.temperatureLabel,
        scoringVersion: account.metadata.scoringVersion,
        summary: account.score.explanation.summary,
        drivers: account.score.explanation.drivers.slice(0, 4),
        cautions: account.score.explanation.cautions.slice(0, 2),
        topReasonCodes: account.score.topReasonCodes.slice(0, 4).map(humanizeCode),
      },
      recentSignals,
      openTasks,
      leadSnapshot: {
        relatedLeadCount: account.relatedLeads.length,
        hotLeadCount: account.relatedLeads.filter(
          (lead) => lead.temperature === "HOT" || lead.temperature === "URGENT",
        ).length,
        slaRiskLeadCount,
      },
      routing: {
        currentQueue: routingStatus.currentQueue,
        ownerName: routingStatus.ownerName,
        summary: latestRouting?.explanation.summary ?? null,
      },
      auditHighlights,
      hasSlaRisk,
      instructions: {
        mode: requestedMode,
        length: requestedLength,
      },
    },
    fallbackSummary: buildAccountFallbackSummary({
      baseSummary: account.summary,
      routingQueue: routingStatus.currentQueue,
      routingOwnerName: routingStatus.ownerName,
      hasSlaRisk,
    }),
    fallbackKeyDrivers,
    sourceSummary: {
      score: account.metadata.overallScore,
      temperature: account.metadata.temperature,
      recentSignalCount: recentSignals.length,
      openTaskCount: taskQueue.length,
      hasSlaRisk,
      routingStatus,
      auditHighlightCount: auditHighlights.length,
    },
  };
}

export async function buildActionNoteContext(
  leadId: string,
  options: ActionNoteRequest = {},
): Promise<ActionNoteAiContext | null> {
  const lead = await getLeadById(leadId);

  if (!lead) {
    return null;
  }

  const requestedMode = getDefaultActionMode(options.mode);
  const requestedLength = getDefaultLength(options.length);

  const [leadScore, openTasks, routingDecisions, accountSnapshot, recentSignals] = await Promise.all([
    getLeadScoreBreakdown(leadId),
    getTasksForLead(leadId),
    getRoutingDecisionsForEntity("lead", leadId),
    db.account.findUnique({
      where: { id: lead.accountId },
      select: {
        name: true,
        temperature: true,
        namedOwner: {
          select: {
            name: true,
          },
        },
      },
    }),
    getLeadSignalsForPrompt(leadId, lead.accountId),
  ]);

  if (!leadScore) {
    return null;
  }

  const latestRouting = routingDecisions[0] ?? null;
  const routingStatus = {
    currentQueue: latestRouting?.assignedQueue ?? lead.routing.currentQueue,
    ownerName:
      latestRouting?.assignedOwner?.name ??
      lead.currentOwnerName ??
      accountSnapshot?.namedOwner?.name ??
      null,
  };
  const openPromptTasks = openTasks.slice(0, 3).map<LeadPromptTask>((task) => ({
    title: task.title,
    priority: task.priorityLabel,
    status: task.status,
    dueAtIso: task.dueAtIso,
    ownerName: task.owner?.name ?? null,
    slaState: task.sla.currentState,
  }));
  const hasSlaRisk =
    isSlaRiskState(lead.sla.currentState) ||
    openTasks.some((task) => isSlaRiskState(task.sla.currentState));
  const topReasonLabel = getTopReasonLabel(leadScore.topReasonCodes);
  const primarySignal = recentSignals[0];

  return {
    leadId,
    accountId: lead.accountId,
    accountName: lead.accountName,
    requestedMode,
    requestedLength,
    promptContext: {
      lead: {
        id: lead.id,
        accountName: lead.accountName,
        contactName: lead.contactName,
        source: lead.source,
        inboundType: lead.inboundType,
        status: formatEnumLabel(lead.status),
        temperature: formatEnumLabel(lead.temperature),
        currentOwnerName: lead.currentOwnerName,
      },
      score: {
        totalScore: lead.score,
        temperature: formatEnumLabel(lead.temperature),
        summary: leadScore.explanation.summary,
        drivers: leadScore.explanation.drivers.slice(0, 4),
        topReasonCodes: leadScore.topReasonCodes.slice(0, 4).map(humanizeCode),
      },
      recentSignals,
      openTasks: openPromptTasks,
      routing: {
        currentQueue: routingStatus.currentQueue,
        ownerName: routingStatus.ownerName,
        summary: latestRouting?.explanation.summary ?? null,
      },
      sla: {
        currentState: lead.sla.currentState,
        explanation: lead.sla.explanation,
        dueAtIso: lead.sla.dueAtIso,
        firstResponseAtIso: lead.firstResponseAtIso,
      },
      accountContext: {
        temperature: accountSnapshot ? formatEnumLabel(accountSnapshot.temperature) : null,
        namedOwner: accountSnapshot?.namedOwner?.name ?? null,
      },
      instructions: {
        mode: requestedMode,
        length: requestedLength,
      },
    },
    fallbackNote: buildLeadFallbackNote({
      accountName: lead.accountName,
      contactName: lead.contactName,
      primarySignal,
      topReasonLabel,
      routingQueue: routingStatus.currentQueue,
      routingOwnerName: routingStatus.ownerName,
    }),
    fallbackSuggestedAngle: buildLeadSuggestedAngle({
      accountName: lead.accountName,
      temperature: formatEnumLabel(lead.temperature),
      topReasonLabel,
      primarySignal,
    }),
    sourceSummary: {
      leadScore: lead.score,
      leadTemperature: lead.temperature,
      recentSignalsUsed: recentSignals.length,
      topReasonCodes: leadScore.topReasonCodes.slice(0, 4),
      openTaskCount: openTasks.length,
      hasSlaRisk,
      routingStatus,
    },
  };
}
