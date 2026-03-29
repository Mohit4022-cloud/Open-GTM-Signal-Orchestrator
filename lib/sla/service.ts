import { randomUUID } from "node:crypto";

import {
  Prisma,
  SlaEntityType,
  SlaEventType,
  TaskStatus,
  type PrismaClient,
  type SignalCategory,
  type SignalType,
  type Temperature,
} from "@prisma/client";

import type { DashboardSlaSummaryContract } from "@/lib/contracts/sla";
import { db } from "@/lib/db";
import { recordSlaAssigned, recordSlaBreached, recordSlaResolved } from "@/lib/audit/sla";
import { createLeadSlaEscalationTaskWithClient } from "@/lib/actions/escalations";

import { resolveSlaPolicy } from "./policies";
import { getSlaEventsForEntity, mapLeadSlaSnapshot, mapTaskSlaSnapshot } from "./queries";

type SlaClient = Prisma.TransactionClient | PrismaClient;

type LeadAssignmentContext = {
  inboundType?: string | null;
  temperature?: Temperature | null;
  triggerSignal?:
    | {
        eventType: SignalType;
        eventCategory: SignalCategory;
        receivedAt: Date;
      }
    | null;
  referenceTime?: Date | string | null;
};

type TaskAssignmentContext = {
  isTracked?: boolean;
  policyKey?: string | null;
  policyVersion?: string | null;
  targetMinutes?: number | null;
  dueAt?: Date | string | null;
};

function toJsonValue(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function resolveDate(value: Date | string | null | undefined, fallback: Date) {
  if (!value) {
    return fallback;
  }

  const resolved = value instanceof Date ? value : new Date(value);
  return Number.isNaN(resolved.getTime()) ? fallback : resolved;
}

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000);
}

function getUtcDayRange(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

async function createSlaEvent(
  client: SlaClient,
  params: {
    entityType: SlaEntityType;
    entityId: string;
    accountId?: string | null;
    leadId?: string | null;
    taskId?: string | null;
    eventType: SlaEventType;
    policyVersion?: string | null;
    policyKey?: string | null;
    targetMinutes?: number | null;
    dueAt?: Date | null;
    breachedAt?: Date | null;
    resolvedAt?: Date | null;
    explanation: string;
    reasonCodes?: string[];
    createdAt?: Date | null;
  },
) {
  return client.slaEvent.create({
    data: {
      id: randomUUID(),
      entityType: params.entityType,
      entityId: params.entityId,
      accountId: params.accountId ?? null,
      leadId: params.leadId ?? null,
      taskId: params.taskId ?? null,
      eventType: params.eventType,
      policyVersion: params.policyVersion ?? null,
      policyKey: params.policyKey ?? null,
      targetMinutes: params.targetMinutes ?? null,
      dueAt: params.dueAt ?? null,
      breachedAt: params.breachedAt ?? null,
      resolvedAt: params.resolvedAt ?? null,
      explanationJson: toJsonValue({
        summary: params.explanation,
        reasonCodes: params.reasonCodes ?? [],
      }),
      createdAt: params.createdAt ?? undefined,
    },
  });
}

export async function assignSlaForLeadWithClient(
  client: SlaClient,
  leadId: string,
  context: LeadAssignmentContext = {},
) {
  const lead = await client.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      accountId: true,
      inboundType: true,
      temperature: true,
      createdAt: true,
      routedAt: true,
      slaPolicyKey: true,
      slaPolicyVersion: true,
      slaTargetMinutes: true,
      slaDeadlineAt: true,
      slaBreachedAt: true,
      firstResponseAt: true,
      signals: {
        take: 1,
        orderBy: {
          receivedAt: "desc",
        },
        select: {
          eventType: true,
          eventCategory: true,
          receivedAt: true,
        },
      },
    },
  });

  if (!lead) {
    return null;
  }

  const referenceTime = resolveDate(
    context.referenceTime,
    lead.routedAt ?? lead.createdAt,
  );
  const resolvedPolicy = await resolveSlaPolicy(
    {
      entityType: "lead",
      inboundType: context.inboundType ?? lead.inboundType,
      temperature: context.temperature ?? lead.temperature,
      triggerSignal: context.triggerSignal ?? lead.signals[0] ?? null,
      referenceTime,
    },
    client,
  );

  const hasMaterialChange =
    lead.slaPolicyKey !== resolvedPolicy.policyKey ||
    lead.slaPolicyVersion !== resolvedPolicy.policyVersion ||
    lead.slaTargetMinutes !== resolvedPolicy.targetMinutes ||
    (lead.slaDeadlineAt?.toISOString() ?? null) !== (resolvedPolicy.dueAt?.toISOString() ?? null) ||
    lead.slaBreachedAt !== null;

  const updated = await client.lead.update({
    where: { id: leadId },
    data: {
      slaPolicyKey: resolvedPolicy.policyKey,
      slaPolicyVersion: resolvedPolicy.policyVersion,
      slaTargetMinutes: resolvedPolicy.targetMinutes,
      slaDeadlineAt: resolvedPolicy.dueAt,
      slaStatus: resolvedPolicy.targetMinutes === null ? null : "ON_TRACK",
      slaBreachedAt: null,
      routedAt: lead.routedAt ?? referenceTime,
    },
    select: {
      slaPolicyKey: true,
      slaPolicyVersion: true,
      slaTargetMinutes: true,
      slaDeadlineAt: true,
      slaBreachedAt: true,
      firstResponseAt: true,
      routedAt: true,
    },
  });

  if (hasMaterialChange && resolvedPolicy.targetMinutes !== null) {
    const explanation = `Assigned ${resolvedPolicy.policyKey} to lead ${leadId}.`;
    const auditCreatedAt = addSeconds(referenceTime, 30);
    await createSlaEvent(client, {
      entityType: SlaEntityType.LEAD,
      entityId: leadId,
      leadId,
      accountId: lead.accountId,
      eventType: SlaEventType.ASSIGNED,
      policyVersion: resolvedPolicy.policyVersion,
      policyKey: resolvedPolicy.policyKey,
      targetMinutes: resolvedPolicy.targetMinutes,
      dueAt: resolvedPolicy.dueAt,
      explanation,
      reasonCodes: resolvedPolicy.reasonCodes,
      createdAt: auditCreatedAt,
    });
    await recordSlaAssigned(client, {
      entityType: "lead",
      entityId: leadId,
      accountId: lead.accountId,
      leadId,
      explanation,
      reasonCodes: resolvedPolicy.reasonCodes,
      createdAt: auditCreatedAt,
      afterState: {
        policyKey: resolvedPolicy.policyKey,
        policyVersion: resolvedPolicy.policyVersion,
        targetMinutes: resolvedPolicy.targetMinutes,
        dueAt: resolvedPolicy.dueAt?.toISOString() ?? null,
      },
    });
  }

  return mapLeadSlaSnapshot(updated, referenceTime);
}

export async function assignSlaForLead(leadId: string, context: LeadAssignmentContext = {}) {
  return db.$transaction((client) => assignSlaForLeadWithClient(client, leadId, context));
}

export async function assignSlaForTaskWithClient(
  client: SlaClient,
  taskId: string,
  context: TaskAssignmentContext = {},
) {
  const task = await client.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      accountId: true,
      leadId: true,
      createdAt: true,
      dueAt: true,
      status: true,
      completedAt: true,
      isSlaTracked: true,
      slaPolicyKey: true,
      slaPolicyVersion: true,
      slaTargetMinutes: true,
      slaBreachedAt: true,
      lead: {
        select: {
          slaPolicyKey: true,
          slaPolicyVersion: true,
          slaTargetMinutes: true,
        },
      },
    },
  });

  if (!task) {
    return null;
  }

  const dueAt = resolveDate(context.dueAt, task.dueAt);
  const shouldTrack = context.isTracked ?? task.isSlaTracked;
  const policyKey = context.policyKey ?? task.lead?.slaPolicyKey ?? task.slaPolicyKey ?? null;
  const policyVersion =
    context.policyVersion ?? task.lead?.slaPolicyVersion ?? task.slaPolicyVersion ?? null;
  const targetMinutes =
    context.targetMinutes ??
    (shouldTrack ? Math.max(0, Math.ceil((dueAt.getTime() - task.createdAt.getTime()) / 60000)) : null);

  const hasMaterialChange =
    task.isSlaTracked !== shouldTrack ||
    task.slaPolicyKey !== policyKey ||
    task.slaPolicyVersion !== policyVersion ||
    task.slaTargetMinutes !== targetMinutes ||
    task.dueAt.toISOString() !== dueAt.toISOString() ||
    task.slaBreachedAt !== null;

  const updated = await client.task.update({
    where: { id: taskId },
    data: {
      isSlaTracked: shouldTrack,
      slaPolicyKey: shouldTrack ? policyKey : null,
      slaPolicyVersion: shouldTrack ? policyVersion : null,
      slaTargetMinutes: shouldTrack ? targetMinutes : null,
      dueAt,
      slaStatus: shouldTrack ? "ON_TRACK" : null,
      slaBreachedAt: shouldTrack ? null : task.slaBreachedAt,
    },
    select: {
      isSlaTracked: true,
      slaPolicyKey: true,
      slaPolicyVersion: true,
      slaTargetMinutes: true,
      dueAt: true,
      slaStatus: true,
      slaBreachedAt: true,
      completedAt: true,
      status: true,
    },
  });

  if (shouldTrack && hasMaterialChange) {
    const explanation = `Assigned task SLA tracking for ${taskId}.`;
    const auditCreatedAt = addSeconds(task.createdAt, 1);
    await createSlaEvent(client, {
      entityType: SlaEntityType.TASK,
      entityId: taskId,
      taskId,
      leadId: task.leadId,
      accountId: task.accountId,
      eventType: SlaEventType.ASSIGNED,
      policyVersion,
      policyKey,
      targetMinutes,
      dueAt,
      explanation,
      createdAt: auditCreatedAt,
    });
    await recordSlaAssigned(client, {
      entityType: "task",
      entityId: taskId,
      accountId: task.accountId,
      leadId: task.leadId,
      explanation,
      reasonCodes: shouldTrack ? ["sla_tracking_enabled"] : [],
      createdAt: auditCreatedAt,
      afterState: {
        isSlaTracked: shouldTrack,
        policyKey,
        policyVersion,
        targetMinutes,
        dueAt: dueAt.toISOString(),
      },
    });
  }

  return mapTaskSlaSnapshot(updated, dueAt);
}

export async function assignSlaForTask(taskId: string, context: TaskAssignmentContext = {}) {
  return db.$transaction((client) => assignSlaForTaskWithClient(client, taskId, context));
}

export async function getLeadSlaStateWithClient(
  client: SlaClient,
  leadId: string,
  now = new Date(),
) {
  const lead = await client.lead.findUnique({
    where: { id: leadId },
    select: {
      slaPolicyKey: true,
      slaPolicyVersion: true,
      slaTargetMinutes: true,
      slaDeadlineAt: true,
      slaBreachedAt: true,
      firstResponseAt: true,
      routedAt: true,
    },
  });

  return lead ? mapLeadSlaSnapshot(lead, now) : null;
}

export async function getLeadSlaState(leadId: string, now = new Date()) {
  return getLeadSlaStateWithClient(db, leadId, now);
}

export async function getTaskSlaStateWithClient(
  client: SlaClient,
  taskId: string,
  now = new Date(),
) {
  const task = await client.task.findUnique({
    where: { id: taskId },
    select: {
      isSlaTracked: true,
      slaPolicyKey: true,
      slaPolicyVersion: true,
      slaTargetMinutes: true,
      dueAt: true,
      slaStatus: true,
      slaBreachedAt: true,
      completedAt: true,
      status: true,
    },
  });

  return task ? mapTaskSlaSnapshot(task, now) : null;
}

export async function getTaskSlaState(taskId: string, now = new Date()) {
  return getTaskSlaStateWithClient(db, taskId, now);
}

export async function getOverdueLeadsWithClient(client: SlaClient, now = new Date()) {
  const leads = await client.lead.findMany({
    where: {
      slaTargetMinutes: {
        not: null,
      },
      slaDeadlineAt: {
        lt: now,
      },
      firstResponseAt: null,
    },
    select: {
      id: true,
      accountId: true,
      slaPolicyKey: true,
      slaPolicyVersion: true,
      slaTargetMinutes: true,
      slaDeadlineAt: true,
      slaBreachedAt: true,
      firstResponseAt: true,
      routedAt: true,
    },
  });

  return leads.map((lead) => ({
    id: lead.id,
    accountId: lead.accountId,
    sla: mapLeadSlaSnapshot(lead, now),
  }));
}

export async function getOverdueLeads(now = new Date()) {
  return getOverdueLeadsWithClient(db, now);
}

export async function getOverdueTasksWithClient(client: SlaClient, now = new Date()) {
  const tasks = await client.task.findMany({
    where: {
      dueAt: {
        lt: now,
      },
      status: {
        not: TaskStatus.COMPLETED,
      },
    },
    select: {
      id: true,
      accountId: true,
      leadId: true,
      isSlaTracked: true,
      slaPolicyKey: true,
      slaPolicyVersion: true,
      slaTargetMinutes: true,
      dueAt: true,
      slaStatus: true,
      slaBreachedAt: true,
      completedAt: true,
      status: true,
    },
  });

  return tasks.map((task) => ({
    id: task.id,
    accountId: task.accountId,
    leadId: task.leadId,
    sla: mapTaskSlaSnapshot(task, now),
  }));
}

export async function getOverdueTasks(now = new Date()) {
  return getOverdueTasksWithClient(db, now);
}

export async function getDashboardSlaSummaryWithClient(
  client: SlaClient,
  now = new Date(),
): Promise<DashboardSlaSummaryContract> {
  const { start, end } = getUtcDayRange(now);

  const [leads, tasks] = await Promise.all([
    client.lead.findMany({
      where: {
        slaTargetMinutes: {
          not: null,
        },
      },
      select: {
        slaPolicyKey: true,
        slaPolicyVersion: true,
        slaTargetMinutes: true,
        slaDeadlineAt: true,
        slaBreachedAt: true,
        firstResponseAt: true,
        routedAt: true,
        createdAt: true,
      },
    }),
    client.task.findMany({
      where: {
        isSlaTracked: true,
      },
      select: {
        isSlaTracked: true,
        slaPolicyKey: true,
        slaPolicyVersion: true,
        slaTargetMinutes: true,
        dueAt: true,
        slaBreachedAt: true,
        completedAt: true,
        status: true,
      },
    }),
  ]);

  const leadSnapshots = leads.map((lead) => ({
    raw: lead,
    sla: mapLeadSlaSnapshot(lead, now),
  }));
  const taskSnapshots = tasks.map((task) => ({
    raw: task,
    sla: mapTaskSlaSnapshot(task, now),
  }));

  const openLeadSnapshots = leadSnapshots.filter((item) => item.sla.currentState !== "completed");
  const openTaskSnapshots = taskSnapshots.filter((item) => item.sla.currentState !== "completed");
  const respondedLeads = leadSnapshots.filter((item) => item.raw.firstResponseAt !== null);
  const determinableAttainment = respondedLeads.filter((item) => item.sla.metSla !== null);
  const responseTimes = respondedLeads.map((item) => {
    const startAt = item.raw.routedAt ?? item.raw.createdAt;
    return Math.max(
      0,
      Math.round((item.raw.firstResponseAt!.getTime() - startAt.getTime()) / 60000),
    );
  });

  const leadMetrics = {
    openTrackedCount: openLeadSnapshots.length,
    dueSoonCount: openLeadSnapshots.filter((item) => item.sla.currentState === "due_soon").length,
    dueTodayCount: openLeadSnapshots.filter((item) => {
      const dueAt = item.raw.slaDeadlineAt;
      return dueAt !== null && dueAt >= start && dueAt < end;
    }).length,
    overdueCount: openLeadSnapshots.filter((item) => item.sla.currentState === "overdue").length,
    breachedCount: openLeadSnapshots.filter((item) => item.sla.currentState === "breached").length,
    averageSpeedToLeadMinutes:
      responseTimes.length > 0
        ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
        : null,
    attainmentRate:
      determinableAttainment.length > 0
        ? Number(
            (
              determinableAttainment.filter((item) => item.sla.metSla === true).length /
              determinableAttainment.length
            ).toFixed(4),
          )
        : null,
  };

  const taskMetrics = {
    openTrackedCount: openTaskSnapshots.length,
    dueSoonCount: openTaskSnapshots.filter((item) => item.sla.currentState === "due_soon").length,
    dueTodayCount: openTaskSnapshots.filter((item) => item.raw.dueAt >= start && item.raw.dueAt < end)
      .length,
    overdueCount: openTaskSnapshots.filter((item) => item.sla.currentState === "overdue").length,
    breachedCount: openTaskSnapshots.filter((item) => item.sla.currentState === "breached").length,
  };

  return {
    asOfIso: now.toISOString(),
    leadMetrics,
    taskMetrics,
    aggregateMetrics: {
      dueSoonCount: leadMetrics.dueSoonCount + taskMetrics.dueSoonCount,
      dueTodayCount: leadMetrics.dueTodayCount + taskMetrics.dueTodayCount,
      overdueCount: leadMetrics.overdueCount + taskMetrics.overdueCount,
      breachedCount: leadMetrics.breachedCount + taskMetrics.breachedCount,
    },
  };
}

export async function getDashboardSlaSummary(now = new Date()) {
  return getDashboardSlaSummaryWithClient(db, now);
}

export async function runSlaBreachChecksWithClient(client: SlaClient, now = new Date()) {
  const [leads, tasks] = await Promise.all([
    client.lead.findMany({
      where: {
        slaTargetMinutes: {
          not: null,
        },
        slaDeadlineAt: {
          lt: now,
        },
        slaBreachedAt: null,
        firstResponseAt: null,
      },
      select: {
        id: true,
        accountId: true,
        currentOwnerId: true,
        slaPolicyKey: true,
        slaPolicyVersion: true,
        slaTargetMinutes: true,
        slaDeadlineAt: true,
        slaStatus: true,
        account: {
          select: {
            name: true,
          },
        },
        routingDecisions: {
          take: 1,
          orderBy: {
            createdAt: "desc",
          },
          select: {
            id: true,
          },
        },
      },
    }),
    client.task.findMany({
      where: {
        isSlaTracked: true,
        dueAt: {
          lt: now,
        },
        slaBreachedAt: null,
        status: {
          not: TaskStatus.COMPLETED,
        },
      },
      select: {
        id: true,
        accountId: true,
        leadId: true,
        slaPolicyKey: true,
        slaPolicyVersion: true,
        slaTargetMinutes: true,
        dueAt: true,
        slaStatus: true,
      },
    }),
  ]);

  for (const lead of leads) {
    await client.lead.update({
      where: { id: lead.id },
      data: {
        slaBreachedAt: now,
        slaStatus: "BREACHED",
      },
    });
    const explanation = `Lead ${lead.id} breached the response SLA with no response recorded.`;
    await createSlaEvent(client, {
      entityType: SlaEntityType.LEAD,
      entityId: lead.id,
      leadId: lead.id,
      accountId: lead.accountId,
      eventType: SlaEventType.BREACHED,
      policyVersion: lead.slaPolicyVersion,
      policyKey: lead.slaPolicyKey,
      targetMinutes: lead.slaTargetMinutes,
      dueAt: lead.slaDeadlineAt,
      breachedAt: now,
      explanation,
      reasonCodes: ["sla_breached_no_response"],
      createdAt: now,
    });
    await recordSlaBreached(client, {
      entityType: "lead",
      entityId: lead.id,
      accountId: lead.accountId,
      leadId: lead.id,
      explanation,
      reasonCodes: ["sla_breached_no_response"],
      createdAt: now,
      beforeState: {
        slaStatus: lead.slaStatus,
        dueAt: lead.slaDeadlineAt?.toISOString() ?? null,
      },
      afterState: {
        slaStatus: "BREACHED",
        breachedAt: now.toISOString(),
      },
    });

    const escalation = await createLeadSlaEscalationTaskWithClient(client, {
      leadId: lead.id,
      accountId: lead.accountId,
      ownerId: lead.currentOwnerId,
      accountName: lead.account?.name ?? lead.id,
      dueAt: lead.slaDeadlineAt,
      breachedAt: now,
      routingDecisionId: lead.routingDecisions[0]?.id ?? null,
    });

    if (escalation.created) {
      await createSlaEvent(client, {
        entityType: SlaEntityType.LEAD,
        entityId: lead.id,
        leadId: lead.id,
        accountId: lead.accountId,
        eventType: SlaEventType.ESCALATION_CREATED,
        policyVersion: lead.slaPolicyVersion,
        policyKey: lead.slaPolicyKey,
        targetMinutes: lead.slaTargetMinutes,
        dueAt: lead.slaDeadlineAt,
        breachedAt: now,
        explanation: `Created escalation task ${escalation.id} for breached lead ${lead.id}.`,
        createdAt: now,
      });
    }
  }

  for (const task of tasks) {
    await client.task.update({
      where: { id: task.id },
      data: {
        slaBreachedAt: now,
        slaStatus: "BREACHED",
      },
    });
    const explanation = `Task ${task.id} breached its tracked SLA.`;
    await createSlaEvent(client, {
      entityType: SlaEntityType.TASK,
      entityId: task.id,
      taskId: task.id,
      accountId: task.accountId,
      leadId: task.leadId,
      eventType: SlaEventType.BREACHED,
      policyVersion: task.slaPolicyVersion,
      policyKey: task.slaPolicyKey,
      targetMinutes: task.slaTargetMinutes,
      dueAt: task.dueAt,
      breachedAt: now,
      explanation,
      reasonCodes: ["sla_breached_no_response"],
      createdAt: now,
    });
    await recordSlaBreached(client, {
      entityType: "task",
      entityId: task.id,
      accountId: task.accountId,
      leadId: task.leadId,
      explanation,
      reasonCodes: ["sla_breached_no_response"],
      createdAt: now,
      beforeState: {
        slaStatus: task.slaStatus,
        dueAt: task.dueAt.toISOString(),
      },
      afterState: {
        slaStatus: "BREACHED",
        breachedAt: now.toISOString(),
      },
    });
  }

  return {
    checkedAtIso: now.toISOString(),
    breachedLeadIds: leads.map((lead) => lead.id),
    breachedTaskIds: tasks.map((task) => task.id),
  };
}

export async function runSlaBreachChecks(now = new Date()) {
  return db.$transaction((client) => runSlaBreachChecksWithClient(client, now));
}

export async function resolveLeadSlaWithClient(
  client: SlaClient,
  params: {
    leadId: string;
    firstResponseAt: Date;
  },
) {
  const lead = await client.lead.findUnique({
    where: { id: params.leadId },
    select: {
      id: true,
      accountId: true,
      slaPolicyKey: true,
      slaPolicyVersion: true,
      slaTargetMinutes: true,
      slaDeadlineAt: true,
      slaBreachedAt: true,
      firstResponseAt: true,
      routedAt: true,
    },
  });

  if (!lead) {
    return null;
  }

  const resolvedAt = params.firstResponseAt;
  const metSla =
    lead.slaDeadlineAt === null ? null : resolvedAt.getTime() <= lead.slaDeadlineAt.getTime();
  const nextEventType = metSla ? SlaEventType.MET : SlaEventType.RESOLVED;
  const explanation =
    metSla === true
      ? `Lead ${lead.id} responded within SLA.`
      : `Lead ${lead.id} resolved after the SLA deadline.`;

  const updated = await client.lead.update({
    where: { id: params.leadId },
    data: {
      firstResponseAt: resolvedAt,
      slaStatus: lead.slaTargetMinutes === null ? null : "COMPLETED",
    },
    select: {
      slaPolicyKey: true,
      slaPolicyVersion: true,
      slaTargetMinutes: true,
      slaDeadlineAt: true,
      slaBreachedAt: true,
      firstResponseAt: true,
      routedAt: true,
    },
  });

  if (lead.slaTargetMinutes !== null) {
    await createSlaEvent(client, {
      entityType: SlaEntityType.LEAD,
      entityId: lead.id,
      leadId: lead.id,
      accountId: lead.accountId,
      eventType: nextEventType,
      policyVersion: lead.slaPolicyVersion,
      policyKey: lead.slaPolicyKey,
      targetMinutes: lead.slaTargetMinutes,
      dueAt: lead.slaDeadlineAt,
      breachedAt: lead.slaBreachedAt,
      resolvedAt,
      explanation,
      reasonCodes: metSla ? ["sla_met_first_response_on_time"] : ["sla_breached_no_response"],
      createdAt: resolvedAt,
    });
    await recordSlaResolved(client, {
      entityType: "lead",
      entityId: lead.id,
      accountId: lead.accountId,
      leadId: lead.id,
      explanation,
      reasonCodes: metSla ? ["sla_met_first_response_on_time"] : ["sla_breached_no_response"],
      createdAt: resolvedAt,
      beforeState: {
        firstResponseAt: lead.firstResponseAt?.toISOString() ?? null,
        slaStatus: lead.slaBreachedAt ? "BREACHED" : "ON_TRACK",
      },
      afterState: {
        firstResponseAt: resolvedAt.toISOString(),
        slaStatus: "COMPLETED",
        metSla,
      },
    });
  }

  return mapLeadSlaSnapshot(updated, resolvedAt);
}

export async function resolveLeadSla(params: { leadId: string; firstResponseAt: Date }) {
  return db.$transaction((client) => resolveLeadSlaWithClient(client, params));
}

export async function resolveTaskSlaWithClient(
  client: SlaClient,
  params: {
    taskId: string;
    completedAt: Date;
  },
) {
  const task = await client.task.findUnique({
    where: { id: params.taskId },
    select: {
      id: true,
      accountId: true,
      leadId: true,
      isSlaTracked: true,
      slaPolicyKey: true,
      slaPolicyVersion: true,
      slaTargetMinutes: true,
      dueAt: true,
      slaStatus: true,
      slaBreachedAt: true,
      completedAt: true,
      status: true,
    },
  });

  if (!task) {
    return null;
  }

  const metSla =
    task.dueAt === null ? null : params.completedAt.getTime() <= task.dueAt.getTime();
  const nextEventType = metSla ? SlaEventType.MET : SlaEventType.RESOLVED;
  const explanation =
    metSla === true
      ? `Task ${task.id} completed within SLA.`
      : `Task ${task.id} completed after the SLA deadline.`;

  const updated = await client.task.update({
    where: { id: params.taskId },
    data: {
      completedAt: params.completedAt,
      status: TaskStatus.COMPLETED,
      slaStatus: task.isSlaTracked ? "COMPLETED" : task.slaBreachedAt ? "BREACHED" : task.slaStatus,
    },
    select: {
      isSlaTracked: true,
      slaPolicyKey: true,
      slaPolicyVersion: true,
      slaTargetMinutes: true,
      dueAt: true,
      slaStatus: true,
      slaBreachedAt: true,
      completedAt: true,
      status: true,
    },
  });

  if (task.isSlaTracked) {
    await createSlaEvent(client, {
      entityType: SlaEntityType.TASK,
      entityId: task.id,
      taskId: task.id,
      accountId: task.accountId,
      leadId: task.leadId,
      eventType: nextEventType,
      policyVersion: task.slaPolicyVersion,
      policyKey: task.slaPolicyKey,
      targetMinutes: task.slaTargetMinutes,
      dueAt: task.dueAt,
      breachedAt: task.slaBreachedAt,
      resolvedAt: params.completedAt,
      explanation,
      reasonCodes: metSla ? ["sla_met_first_response_on_time"] : ["sla_breached_no_response"],
      createdAt: params.completedAt,
    });
    await recordSlaResolved(client, {
      entityType: "task",
      entityId: task.id,
      accountId: task.accountId,
      leadId: task.leadId,
      explanation,
      reasonCodes: metSla ? ["sla_met_first_response_on_time"] : ["sla_breached_no_response"],
      createdAt: params.completedAt,
      beforeState: {
        completedAt: task.completedAt?.toISOString() ?? null,
        slaStatus: task.slaBreachedAt ? "BREACHED" : "ON_TRACK",
      },
      afterState: {
        completedAt: params.completedAt.toISOString(),
        slaStatus: "COMPLETED",
        metSla,
      },
    });
  }

  return mapTaskSlaSnapshot(updated, params.completedAt);
}

export async function resolveTaskSla(params: { taskId: string; completedAt: Date }) {
  return db.$transaction((client) => resolveTaskSlaWithClient(client, params));
}

export async function getLeadSlaEvents(leadId: string, limit = 10) {
  return getSlaEventsForEntity(db, {
    entityType: "lead",
    entityId: leadId,
    limit,
  });
}

export async function getTaskSlaEvents(taskId: string, limit = 10) {
  return getSlaEventsForEntity(db, {
    entityType: "task",
    entityId: taskId,
    limit,
  });
}
