import { randomUUID } from "node:crypto";

import {
  ActionCategory,
  ActionType,
  Prisma,
  TaskPriority,
  TaskStatus,
  TaskType,
  type PrismaClient,
} from "@prisma/client";

import { recordDuplicateActionPrevented, recordTaskCreated } from "@/lib/audit/actions";

type ActionClient = Prisma.TransactionClient | PrismaClient;

function toJsonValue(value: unknown) {
  return value as Prisma.InputJsonValue;
}

export async function createLeadSlaEscalationTaskWithClient(
  client: ActionClient,
  params: {
    leadId: string;
    accountId: string | null;
    ownerId: string | null;
    accountName: string;
    dueAt: Date | null;
    breachedAt: Date;
    routingDecisionId: string | null;
  },
) {
  const dedupeKey = [
    ActionType.ESCALATE_SLA_BREACH,
    "lead",
    params.leadId,
    params.routingDecisionId ?? params.dueAt?.toISOString() ?? params.breachedAt.toISOString(),
  ].join(":");

  const existing = await client.task.findUnique({
    where: { dedupeKey },
    select: { id: true },
  });

  if (existing) {
    await recordDuplicateActionPrevented(client, {
      entityType: "lead",
      entityId: params.leadId,
      accountId: params.accountId,
      leadId: params.leadId,
      explanation: `Duplicate SLA escalation prevented by dedupe key ${dedupeKey}.`,
      reasonCodes: ["sla_breach_requires_escalation"],
      afterState: {
        actionType: ActionType.ESCALATE_SLA_BREACH,
        dedupeKey,
        existingTaskId: existing.id,
      },
    });

    return {
      id: existing.id,
      created: false,
      dedupeKey,
    };
  }

  const explanation = `${params.accountName} has breached the lead response SLA and requires immediate escalation.`;

  const created = await client.task.create({
    data: {
      id: randomUUID(),
      leadId: params.leadId,
      accountId: params.accountId,
      ownerId: params.ownerId,
      taskType: TaskType.ESCALATION,
      actionType: ActionType.ESCALATE_SLA_BREACH,
      actionCategory: ActionCategory.ESCALATION,
      priority: TaskPriority.URGENT,
      dueAt: params.breachedAt,
      status: TaskStatus.OPEN,
      title: `Escalate SLA breach for ${params.accountName}`,
      description: explanation,
      sourceReasonCodesJson: toJsonValue(["sla_breach_requires_escalation"]),
      explanationJson: toJsonValue({
        summary: explanation,
        reasonCodes: ["sla_breach_requires_escalation"],
        reasonDetails: [],
        trigger: {
          signalId: null,
          routingDecisionId: params.routingDecisionId,
          scoreHistoryId: null,
        },
        context: {
          entityType: "lead",
          entityId: params.leadId,
          accountId: params.accountId,
          leadId: params.leadId,
          temperature: null,
          inboundType: null,
          lifecycleStage: null,
          assignedQueue: null,
          isStrategic: false,
          activeAccount: false,
        },
        dueAtIso: params.breachedAt.toISOString(),
        dedupeKey,
      }),
      dedupeKey,
    },
  });

  await recordTaskCreated(client, {
    taskId: created.id,
    entityType: "lead",
    entityId: params.leadId,
    accountId: params.accountId,
    leadId: params.leadId,
    explanation,
    reasonCodes: ["sla_breach_requires_escalation"],
    afterState: {
      taskType: TaskType.ESCALATION,
      actionType: ActionType.ESCALATE_SLA_BREACH,
      actionCategory: ActionCategory.ESCALATION,
      priority: TaskPriority.URGENT,
      dueAt: params.breachedAt.toISOString(),
      ownerId: params.ownerId,
      dedupeKey,
    },
  });

  return {
    id: created.id,
    created: true,
    dedupeKey,
  };
}
