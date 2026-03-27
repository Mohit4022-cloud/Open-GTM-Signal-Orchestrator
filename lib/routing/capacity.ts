import { LeadStatus, TaskStatus, Temperature, type PrismaClient, type Prisma } from "@prisma/client";
import { startOfDay } from "date-fns";

import type {
  RoutingCapacityBlockingCheck,
  RoutingCapacitySnapshotContract,
  RoutingDecisionType,
  RoutingSimulationCapacityScenario,
} from "@/lib/contracts/routing";
import { db } from "@/lib/db";

type RoutingClient = Prisma.TransactionClient | PrismaClient;

export type CapacityScenarioContext = {
  scenario: RoutingSimulationCapacityScenario;
  namedOwnerId: string | null;
  existingOwnerId: string | null;
};

export async function loadCapacitySnapshot(
  client: RoutingClient,
  ownerId: string,
  referenceTime: Date,
): Promise<RoutingCapacitySnapshotContract | null> {
  const [owner, openHotLeads, dailyInboundAssignments, openTaskCount] = await Promise.all([
    client.user.findUnique({
      where: { id: ownerId },
      select: {
        id: true,
        name: true,
        role: true,
        team: true,
        maxOpenHotLeads: true,
        maxDailyInboundAssignments: true,
        maxOpenTasks: true,
      },
    }),
    client.lead.count({
      where: {
        currentOwnerId: ownerId,
        temperature: {
          in: [Temperature.HOT, Temperature.URGENT],
        },
        status: {
          in: [LeadStatus.NEW, LeadStatus.WORKING, LeadStatus.QUALIFIED],
        },
      },
    }),
    client.routingDecision.count({
      where: {
        assignedOwnerId: ownerId,
        createdAt: {
          gte: startOfDay(referenceTime),
        },
        lead: {
          is: {
            inboundType: "Inbound",
          },
        },
      },
    }),
    client.task.count({
      where: {
        ownerId,
        status: {
          not: TaskStatus.COMPLETED,
        },
      },
    }),
  ]);

  if (!owner) {
    return null;
  }

  const blockingChecks: RoutingCapacityBlockingCheck[] = [];

  if (openHotLeads >= owner.maxOpenHotLeads) {
    blockingChecks.push("open_hot_leads");
  }

  if (dailyInboundAssignments >= owner.maxDailyInboundAssignments) {
    blockingChecks.push("daily_inbound_assignments");
  }

  if (openTaskCount >= owner.maxOpenTasks) {
    blockingChecks.push("open_task_count");
  }

  return {
    ownerId: owner.id,
    ownerName: owner.name,
    role: owner.role,
    team: owner.team,
    openHotLeads,
    maxOpenHotLeads: owner.maxOpenHotLeads,
    dailyInboundAssignments,
    maxDailyInboundAssignments: owner.maxDailyInboundAssignments,
    openTaskCount,
    maxOpenTasks: owner.maxOpenTasks,
    hasCapacity: blockingChecks.length === 0,
    blockingChecks,
  };
}

export function applyCapacityScenarioOverride(
  snapshot: RoutingCapacitySnapshotContract,
  params: {
    policyType: RoutingDecisionType;
    scenarioContext: CapacityScenarioContext | null;
  },
): RoutingCapacitySnapshotContract {
  const scenario = params.scenarioContext?.scenario ?? "current";
  const shouldForceOverload =
    scenario === "all_candidates_overloaded" ||
    (scenario === "named_owner_overloaded" &&
      snapshot.ownerId === params.scenarioContext?.namedOwnerId &&
      params.policyType === "named_account_owner") ||
    (scenario === "existing_owner_overloaded" &&
      snapshot.ownerId === params.scenarioContext?.existingOwnerId &&
      params.policyType === "existing_account_owner") ||
    (scenario === "territory_pool_overloaded" &&
      params.policyType === "territory_segment_rule");

  if (!shouldForceOverload) {
    return snapshot;
  }

  return {
    ...snapshot,
    openHotLeads: Math.max(snapshot.openHotLeads, snapshot.maxOpenHotLeads),
    dailyInboundAssignments: Math.max(
      snapshot.dailyInboundAssignments,
      snapshot.maxDailyInboundAssignments,
    ),
    openTaskCount: Math.max(snapshot.openTaskCount, snapshot.maxOpenTasks),
    hasCapacity: false,
    blockingChecks: [
      "open_hot_leads",
      "daily_inbound_assignments",
      "open_task_count",
    ],
  };
}

export async function getCapacitySnapshotForOwner(
  ownerId: string,
  referenceTime: Date,
) {
  return loadCapacitySnapshot(db, ownerId, referenceTime);
}
