import { LeadStatus, Temperature, type Prisma } from "@prisma/client";

import type {
  LeadDetailContract,
  LeadFiltersInput,
  LeadQueueContract,
} from "@/lib/contracts/leads";
import { db } from "@/lib/db";
import { getContactDisplayName } from "@/lib/data/signals/presentation";
import { mapLeadSlaSnapshot } from "@/lib/sla";
import { resolveLeadSlaWithClient, getLeadSlaEvents } from "@/lib/sla";

function buildWhere(filters: LeadFiltersInput): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};
  const recentlyRoutedSince = new Date(Date.now() - 24 * 60 * 60 * 1000);

  if (filters.ownerId) {
    where.currentOwnerId = filters.ownerId;
  }

  if (filters.status) {
    where.status = {
      in: Array.isArray(filters.status) ? filters.status : [filters.status],
    };
  }

  if (filters.temperature) {
    where.temperature = {
      in: Array.isArray(filters.temperature) ? filters.temperature : [filters.temperature],
    };
  }

  if (filters.tracked !== undefined) {
    where.slaTargetMinutes = filters.tracked ? { not: null } : null;
  }

  if (filters.hot !== undefined) {
    where.temperature = filters.hot
      ? { in: [Temperature.HOT, Temperature.URGENT] }
      : { notIn: [Temperature.HOT, Temperature.URGENT] };
  }

  if (filters.unassigned !== undefined) {
    where.currentOwnerId = filters.unassigned ? null : { not: null };
  }

  if (filters.recentlyRouted !== undefined) {
    if (filters.recentlyRouted) {
      where.routedAt = { gte: recentlyRoutedSince };
    }
  }

  return where;
}

function normalizeFilterArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function mapLeadRow(
  row: {
    id: string;
    accountId: string;
    source: string;
    inboundType: string;
    status: LeadStatus;
    temperature: Temperature;
    score: number;
    createdAt: Date;
    updatedAt: Date;
    currentOwnerId: string | null;
    firstResponseAt: Date | null;
    routedAt: Date | null;
    slaPolicyKey: string | null;
    slaPolicyVersion: string | null;
    slaTargetMinutes: number | null;
    slaDeadlineAt: Date | null;
    slaBreachedAt: Date | null;
    account: {
      name: string;
    };
    contact:
      | {
          id: string;
          firstName: string;
          lastName: string;
          email: string;
        }
      | null;
    currentOwner:
      | {
          name: string;
        }
      | null;
    routingDecisions: {
      assignedQueue: string;
    }[];
  },
  now: Date,
) {
  const sla = mapLeadSlaSnapshot(
    {
      slaPolicyKey: row.slaPolicyKey,
      slaPolicyVersion: row.slaPolicyVersion,
      slaTargetMinutes: row.slaTargetMinutes,
      slaDeadlineAt: row.slaDeadlineAt,
      slaBreachedAt: row.slaBreachedAt,
      firstResponseAt: row.firstResponseAt,
      routedAt: row.routedAt,
    },
    now,
  );
  const routedAtIso = row.routedAt?.toISOString() ?? null;

  return {
    id: row.id,
    accountId: row.accountId,
    accountName: row.account.name,
    contactId: row.contact?.id ?? null,
    contactName: row.contact
      ? getContactDisplayName(row.contact.firstName, row.contact.lastName, row.contact.email)
      : null,
    currentOwnerId: row.currentOwnerId,
    currentOwnerName: row.currentOwner?.name ?? null,
    source: row.source,
    inboundType: row.inboundType,
    status: row.status,
    temperature: row.temperature,
    score: row.score,
    createdAtIso: row.createdAt.toISOString(),
    updatedAtIso: row.updatedAt.toISOString(),
    routing: {
      currentQueue: row.routingDecisions[0]?.assignedQueue ?? null,
      routedAtIso,
    },
    queueFlags: {
      isHot: row.temperature === Temperature.HOT || row.temperature === Temperature.URGENT,
      isOverdueSla: sla.currentState === "overdue" || sla.currentState === "breached",
      isUnassigned: row.currentOwnerId === null,
      isRecentlyRouted:
        row.routedAt !== null && now.getTime() - row.routedAt.getTime() <= 24 * 60 * 60 * 1000,
    },
    sla,
  };
}

export async function getLeadQueue(filters: LeadFiltersInput = {}): Promise<LeadQueueContract> {
  const now = new Date();
  const rows = await db.lead.findMany({
    where: buildWhere(filters),
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      accountId: true,
      source: true,
      inboundType: true,
      status: true,
      temperature: true,
      score: true,
      createdAt: true,
      updatedAt: true,
      currentOwnerId: true,
      firstResponseAt: true,
      routedAt: true,
      slaPolicyKey: true,
      slaPolicyVersion: true,
      slaTargetMinutes: true,
      slaDeadlineAt: true,
      slaBreachedAt: true,
      account: {
        select: {
          name: true,
        },
      },
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      currentOwner: {
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
          assignedQueue: true,
        },
      },
    },
  });

  const mappedRows = rows
    .map((row) => mapLeadRow(row, now))
    .filter((row) => {
      if (
        filters.recentlyRouted !== undefined &&
        row.queueFlags.isRecentlyRouted !== filters.recentlyRouted
      ) {
        return false;
      }

      if (!filters.slaState) {
        return filters.overdue === undefined
          ? true
          : filters.overdue
            ? row.queueFlags.isOverdueSla
            : !row.queueFlags.isOverdueSla;
      }

      const states = Array.isArray(filters.slaState) ? filters.slaState : [filters.slaState];
      const matchesState = states.includes(row.sla.currentState);

      if (filters.overdue === undefined) {
        return matchesState;
      }

      return matchesState && (filters.overdue ? row.queueFlags.isOverdueSla : !row.queueFlags.isOverdueSla);
    });

  return {
    filters: {
      ownerId: filters.ownerId ?? "",
      statuses: normalizeFilterArray(filters.status),
      temperatures: normalizeFilterArray(filters.temperature),
      slaStates: normalizeFilterArray(filters.slaState),
      tracked: filters.tracked ?? null,
      overdue: filters.overdue ?? null,
      hot: filters.hot ?? null,
      unassigned: filters.unassigned ?? null,
      recentlyRouted: filters.recentlyRouted ?? null,
    },
    totalCount: mappedRows.length,
    rows: mappedRows,
  };
}

export async function getLeadById(id: string): Promise<LeadDetailContract | null> {
  const now = new Date();
  const lead = await db.lead.findUnique({
    where: { id },
    select: {
      id: true,
      accountId: true,
      source: true,
      inboundType: true,
      status: true,
      temperature: true,
      score: true,
      createdAt: true,
      updatedAt: true,
      currentOwnerId: true,
      firstResponseAt: true,
      routedAt: true,
      slaPolicyKey: true,
      slaPolicyVersion: true,
      slaTargetMinutes: true,
      slaDeadlineAt: true,
      slaBreachedAt: true,
      account: {
        select: {
          name: true,
        },
      },
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      currentOwner: {
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
          assignedQueue: true,
        },
      },
    },
  });

  if (!lead) {
    return null;
  }

  const mappedLead = mapLeadRow(lead, now);

  return {
    ...mappedLead,
    firstResponseAtIso: lead.firstResponseAt?.toISOString() ?? null,
    routedAtIso: lead.routedAt?.toISOString() ?? null,
    timelineSummary: `${lead.account.name} is ${mappedLead.sla.currentState.replaceAll("_", " ")} against ${mappedLead.sla.policyKey ?? "no active SLA policy"}.`,
    events: await getLeadSlaEvents(lead.id),
  };
}

export async function updateLead(
  id: string,
  input: {
    status?: LeadStatus;
    firstResponseAtIso?: string;
  },
) {
  const updatedId = await db.$transaction(async (client) => {
    const existing = await client.lead.findUnique({
      where: { id },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return null;
    }

    if (input.status !== undefined) {
      await client.lead.update({
        where: { id },
        data: {
          status: input.status,
        },
      });
    }

    if (input.firstResponseAtIso) {
      await resolveLeadSlaWithClient(client, {
        leadId: id,
        firstResponseAt: new Date(input.firstResponseAtIso),
      });
    }

    return existing.id;
  });

  return updatedId ? getLeadById(updatedId) : null;
}
