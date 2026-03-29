import { SlaEventType, TaskStatus, TaskPriority } from "@prisma/client";

import {
  priorityCodeByValue,
  priorityLabelByCode,
} from "@/lib/contracts/actions";
import type {
  DashboardFiltersInput,
  DashboardSlaComplianceTrendPointContract,
  DashboardSlaLeadPreviewItemContract,
  DashboardSlaViewContract,
  DashboardTaskDueCollectionContract,
} from "@/lib/contracts/dashboard";
import { db } from "@/lib/db";
import { formatEnumLabel } from "@/lib/formatters/display";
import { mapLeadSlaSnapshot, mapTaskSlaSnapshot } from "@/lib/sla";

import {
  buildAppliedFilters,
  buildDashboardDemoMeta,
  getDashboardAccountScope,
  resolveDashboardWindow,
} from "./shared";
import {
  formatDashboardPointLabel,
  formatRelativeFromReference,
  toUtcIsoDate,
} from "./reference-time";

export async function getDashboardSlaView(
  filters: DashboardFiltersInput = {},
): Promise<DashboardSlaViewContract> {
  const accountScope = await getDashboardAccountScope(filters);
  const window = await resolveDashboardWindow(filters, accountScope);
  const [leads, tasks, slaEvents] = await Promise.all([
    db.lead.findMany({
      where: {
        slaTargetMinutes: {
          not: null,
        },
        ...(accountScope.hasScopedAccounts
          ? {
              accountId: {
                in: accountScope.accountIds,
              },
            }
          : {}),
      },
      select: {
        id: true,
        accountId: true,
        inboundType: true,
        temperature: true,
        currentOwner: {
          select: {
            name: true,
          },
        },
        account: {
          select: {
            name: true,
          },
        },
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
    db.task.findMany({
      where: {
        isSlaTracked: true,
        status: {
          in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS],
        },
        ...(accountScope.hasScopedAccounts
          ? {
              accountId: {
                in: accountScope.accountIds,
              },
            }
          : {}),
      },
      select: {
        id: true,
        title: true,
        priority: true,
        dueAt: true,
        owner: {
          select: {
            name: true,
          },
        },
        account: {
          select: {
            id: true,
            name: true,
          },
        },
        leadId: true,
        isSlaTracked: true,
        slaPolicyKey: true,
        slaPolicyVersion: true,
        slaTargetMinutes: true,
        slaBreachedAt: true,
        completedAt: true,
        status: true,
      },
      orderBy: {
        dueAt: "asc",
      },
    }),
    db.slaEvent.findMany({
      where: {
        createdAt: {
          gte: window.start,
          lt: window.endExclusive,
        },
        ...(accountScope.hasScopedAccounts
          ? {
              accountId: {
                in: accountScope.accountIds,
              },
            }
          : {}),
      },
      select: {
        eventType: true,
        createdAt: true,
      },
    }),
  ]);

  const leadSnapshots = leads.map((lead) => ({
    lead,
    sla: mapLeadSlaSnapshot(lead, window.referenceDate),
  }));
  const taskSnapshots = tasks.map((task) => ({
    task,
    sla: mapTaskSlaSnapshot(task, window.referenceDate),
  }));

  const openLeadSnapshots = leadSnapshots.filter(
    (item) => item.sla.currentState !== "completed",
  );
  const openTaskSnapshots = taskSnapshots.filter(
    (item) => item.sla.currentState !== "completed",
  );
  const respondedLeads = leadSnapshots.filter(
    (item) => item.lead.firstResponseAt !== null,
  );
  const determinableAttainment = respondedLeads.filter(
    (item) => item.sla.metSla !== null,
  );
  const responseTimes = respondedLeads.map((item) => {
    const startAt = item.lead.routedAt ?? item.lead.createdAt;
    return Math.max(
      0,
      Math.round(
        (item.lead.firstResponseAt!.getTime() - startAt.getTime()) / 60000,
      ),
    );
  });

  const summary = {
    asOfIso: window.referenceDate.toISOString(),
    leadMetrics: {
      openTrackedCount: openLeadSnapshots.length,
      dueSoonCount: openLeadSnapshots.filter(
        (item) => item.sla.currentState === "due_soon",
      ).length,
      dueTodayCount: openLeadSnapshots.filter((item) => {
        return (
          item.lead.slaDeadlineAt !== null &&
          item.lead.slaDeadlineAt >= window.start &&
          item.lead.slaDeadlineAt < window.endExclusive
        );
      }).length,
      overdueCount: openLeadSnapshots.filter(
        (item) => item.sla.currentState === "overdue",
      ).length,
      breachedCount: openLeadSnapshots.filter(
        (item) => item.sla.currentState === "breached",
      ).length,
      averageSpeedToLeadMinutes:
        responseTimes.length > 0
          ? Math.round(
              responseTimes.reduce((sum, value) => sum + value, 0) /
                responseTimes.length,
            )
          : null,
      attainmentRate:
        determinableAttainment.length > 0
          ? Number(
              (
                determinableAttainment.filter(
                  (item) => item.sla.metSla === true,
                ).length / determinableAttainment.length
              ).toFixed(4),
            )
          : null,
    },
    taskMetrics: {
      openTrackedCount: openTaskSnapshots.length,
      dueSoonCount: openTaskSnapshots.filter(
        (item) => item.sla.currentState === "due_soon",
      ).length,
      dueTodayCount: openTaskSnapshots.filter(
        (item) =>
          item.task.dueAt >= window.start && item.task.dueAt < window.endExclusive,
      ).length,
      overdueCount: openTaskSnapshots.filter(
        (item) => item.sla.currentState === "overdue",
      ).length,
      breachedCount: openTaskSnapshots.filter(
        (item) => item.sla.currentState === "breached",
      ).length,
    },
    aggregateMetrics: {
      dueSoonCount:
        openLeadSnapshots.filter((item) => item.sla.currentState === "due_soon")
          .length +
        openTaskSnapshots.filter((item) => item.sla.currentState === "due_soon")
          .length,
      dueTodayCount:
        openLeadSnapshots.filter((item) => {
          return (
            item.lead.slaDeadlineAt !== null &&
            item.lead.slaDeadlineAt >= window.start &&
            item.lead.slaDeadlineAt < window.endExclusive
          );
        }).length +
        openTaskSnapshots.filter(
          (item) =>
            item.task.dueAt >= window.start && item.task.dueAt < window.endExclusive,
        ).length,
      overdueCount:
        openLeadSnapshots.filter((item) => item.sla.currentState === "overdue")
          .length +
        openTaskSnapshots.filter((item) => item.sla.currentState === "overdue")
          .length,
      breachedCount:
        openLeadSnapshots.filter((item) => item.sla.currentState === "breached")
          .length +
        openTaskSnapshots.filter((item) => item.sla.currentState === "breached")
          .length,
    },
  };

  const breachedLeads: DashboardSlaLeadPreviewItemContract[] = openLeadSnapshots
    .filter((item) => item.sla.currentState === "breached")
    .sort((left, right) => {
      const leftBreachedAt = left.lead.slaBreachedAt?.getTime() ?? 0;
      const rightBreachedAt = right.lead.slaBreachedAt?.getTime() ?? 0;
      return rightBreachedAt - leftBreachedAt;
    })
    .slice(0, 5)
    .map((item) => ({
      leadId: item.lead.id,
      accountId: item.lead.accountId,
      accountName: item.lead.account?.name ?? null,
      ownerName: item.lead.currentOwner?.name ?? null,
      inboundType: item.lead.inboundType,
      temperatureLabel: formatEnumLabel(item.lead.temperature),
      dueAtIso: item.lead.slaDeadlineAt?.toISOString() ?? null,
      dueAtLabel: item.lead.slaDeadlineAt
        ? formatRelativeFromReference(
            item.lead.slaDeadlineAt,
            window.referenceDate,
          )
        : null,
      breachedAtIso: item.lead.slaBreachedAt?.toISOString() ?? null,
    }));

  const complianceByDate = new Map<string, DashboardSlaComplianceTrendPointContract>();
  for (const pointDate of window.pointDates) {
    const key = toUtcIsoDate(pointDate);
    complianceByDate.set(key, {
      date: formatDashboardPointLabel(pointDate),
      metCount: 0,
      breachedCount: 0,
      resolvedAfterBreachCount: 0,
    });
  }

  for (const event of slaEvents) {
    const key = toUtcIsoDate(event.createdAt);
    const point = complianceByDate.get(key);

    if (!point) {
      continue;
    }

    if (event.eventType === SlaEventType.MET) {
      point.metCount += 1;
    } else if (event.eventType === SlaEventType.BREACHED) {
      point.breachedCount += 1;
    } else if (event.eventType === SlaEventType.RESOLVED) {
      point.resolvedAfterBreachCount += 1;
    }
  }

  const tasksDueToday: DashboardTaskDueCollectionContract = {
    totalCount: tasks.filter(
      (task) => task.dueAt >= window.start && task.dueAt < window.endExclusive,
    ).length,
    rows: tasks
      .filter(
        (task) => task.dueAt >= window.start && task.dueAt < window.endExclusive,
      )
      .slice(0, 6)
      .map((task) => {
        const priorityCode = priorityCodeByValue[task.priority as TaskPriority];
        return {
          id: task.id,
          title: task.title,
          priorityCode,
          priorityLabel: priorityLabelByCode[priorityCode],
          ownerName: task.owner?.name ?? null,
          accountId: task.account?.id ?? null,
          accountName: task.account?.name ?? null,
          leadId: task.leadId,
          dueAtIso: task.dueAt.toISOString(),
          dueAtLabel: formatRelativeFromReference(
            task.dueAt,
            window.referenceDate,
          ),
          isOverdue: task.dueAt.getTime() < window.referenceDate.getTime(),
        };
      }),
  };

  return {
    asOfIso: window.referenceDate.toISOString(),
    demoMeta: buildDashboardDemoMeta(window.referenceDate),
    appliedFilters: buildAppliedFilters(filters, window),
    summary,
    slaHealth: [
      {
        label: "Within SLA",
        value: Math.max(
          0,
          summary.leadMetrics.openTrackedCount -
            summary.leadMetrics.overdueCount -
            summary.leadMetrics.breachedCount,
        ),
        tone: "positive",
      },
      {
        label: "At risk",
        value: summary.leadMetrics.overdueCount,
        tone: "warning",
      },
      {
        label: "Breached",
        value: summary.leadMetrics.breachedCount,
        tone: "danger",
      },
    ],
    complianceTrend: Array.from(complianceByDate.values()),
    breachedLeads,
    tasksDueToday,
  };
}
