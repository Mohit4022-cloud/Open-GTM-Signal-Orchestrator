import type { Prisma, PrismaClient } from "@prisma/client";

import type {
  AuditEntitySummaryContract,
  AuditLogEntryContract,
  AuditLogQueryOptions,
  AuditReasonSummaryContract,
  AuditStateSummaryContract,
} from "@/lib/contracts/audit";
import { db } from "@/lib/db";
import { formatDateTime, formatEnumLabel, formatRelativeTime } from "@/lib/formatters/display";

type AuditQueryClient = Prisma.TransactionClient | PrismaClient;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function isIsoDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value));
}

function humanizeKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (part) => part.toUpperCase());
}

function formatSummaryValue(key: string, value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "boolean") {
    if (key === "metSla") {
      return value ? "Met" : "Missed";
    }

    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    if (key === "targetMinutes") {
      return `${value}m`;
    }

    return `${value}`;
  }

  if (typeof value === "string") {
    if (isIsoDateString(value)) {
      return formatDateTime(value);
    }

    if (key === "reasonCodes") {
      return parseStringArray([value]).join(", ");
    }

    if (
      key.endsWith("Type") ||
      key.endsWith("Status") ||
      key === "priority" ||
      key === "temperature" ||
      key === "policyKey"
    ) {
      return formatEnumLabel(value);
    }

    return value;
  }

  if (Array.isArray(value)) {
    const items = value
      .flatMap((item) => {
        if (typeof item === "string") {
          return formatEnumLabel(item);
        }

        if (typeof item === "number") {
          return `${item}`;
        }

        return [];
      })
      .filter(Boolean);

    return items.length > 0 ? items.join(", ") : `${value.length} items`;
  }

  if (isRecord(value)) {
    return Object.keys(value).length > 0 ? `${Object.keys(value).length} fields` : null;
  }

  return `${value}`;
}

const preferredSummaryKeys = [
  "ownerName",
  "ownerId",
  "secondaryOwnerId",
  "queue",
  "priority",
  "totalScore",
  "score",
  "temperature",
  "slaStatus",
  "dueAt",
  "policyKey",
  "targetMinutes",
  "reasonCodes",
  "taskType",
  "actionType",
  "status",
  "manualPriorityBoost",
  "existingTaskId",
  "existingRecommendationId",
] as const;

function buildStateSummary(value: unknown): AuditStateSummaryContract {
  const raw = parseRecord(value);

  if (!raw) {
    return {
      raw: null,
      summary: "No state captured.",
      changedKeys: [],
    };
  }

  const seen = new Set<string>();
  const parts: string[] = [];

  for (const key of preferredSummaryKeys) {
    if (!(key in raw)) {
      continue;
    }

    const summaryValue = formatSummaryValue(key, raw[key]);
    if (!summaryValue) {
      continue;
    }

    parts.push(`${humanizeKey(key)}: ${summaryValue}`);
    seen.add(key);
  }

  for (const [key, entry] of Object.entries(raw)) {
    if (seen.has(key)) {
      continue;
    }

    const summaryValue = formatSummaryValue(key, entry);
    if (!summaryValue) {
      continue;
    }

    parts.push(`${humanizeKey(key)}: ${summaryValue}`);
    if (parts.length >= 4) {
      break;
    }
  }

  return {
    raw,
    summary: parts.length > 0 ? parts.slice(0, 4).join(" | ") : "No state details recorded.",
    changedKeys: Object.keys(raw),
  };
}

function buildReasonSummary(
  explicitReasonCodes: unknown,
  before: AuditStateSummaryContract,
  after: AuditStateSummaryContract,
): AuditReasonSummaryContract {
  const explicit = parseStringArray(explicitReasonCodes);
  const fallbackAfter = parseStringArray(after.raw?.reasonCodes);
  const fallbackBefore = parseStringArray(before.raw?.reasonCodes);
  const codes = explicit.length > 0 ? explicit : fallbackAfter.length > 0 ? fallbackAfter : fallbackBefore;
  const primaryCode = codes[0] ?? null;

  return {
    codes,
    primaryCode,
    summary:
      primaryCode === null
        ? "No reason codes recorded."
        : codes.length === 1
          ? formatEnumLabel(primaryCode)
          : `${formatEnumLabel(primaryCode)} +${codes.length - 1} more`,
  };
}

function buildEntitySummary(row: {
  entityType: string;
  entityId: string;
  accountId: string | null;
  leadId: string | null;
}): AuditEntitySummaryContract {
  return {
    type: row.entityType,
    id: row.entityId,
    accountId: row.accountId,
    leadId: row.leadId,
    summary: `${formatEnumLabel(row.entityType)} ${row.entityId}`,
  };
}

function normalizeLimit(limit: number | undefined, fallback: number) {
  if (!limit || !Number.isFinite(limit)) {
    return fallback;
  }

  return Math.max(1, Math.floor(limit));
}

function mapAuditLogEntry(row: {
  id: string;
  eventType: import("@prisma/client").AuditEventType;
  actorType: string;
  actorId: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  accountId: string | null;
  leadId: string | null;
  beforeState: unknown;
  afterState: unknown;
  reasonCodesJson: unknown;
  explanation: string;
  createdAt: Date;
}): AuditLogEntryContract {
  const before = buildStateSummary(row.beforeState);
  const after = buildStateSummary(row.afterState);
  const reason = buildReasonSummary(row.reasonCodesJson, before, after);

  return {
    id: row.id,
    eventType: row.eventType,
    actionCode: row.action,
    timestampIso: row.createdAt.toISOString(),
    timestampLabel: formatRelativeTime(row.createdAt),
    actor: {
      type: row.actorType === "user" ? "user" : "system",
      id: row.actorId,
      name: row.actorName,
      summary: `${formatEnumLabel(row.actorType)} · ${row.actorName}`,
    },
    action: formatEnumLabel(row.action),
    entity: buildEntitySummary(row),
    before,
    after,
    reason,
    explanation: row.explanation,
  };
}

const baseSelect = {
  id: true,
  eventType: true,
  actorType: true,
  actorId: true,
  actorName: true,
  action: true,
  entityType: true,
  entityId: true,
  accountId: true,
  leadId: true,
  beforeState: true,
  afterState: true,
  reasonCodesJson: true,
  explanation: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

export async function getAuditLogForEntity(
  entityType: string,
  entityId: string,
  opts: AuditLogQueryOptions = {},
  client: AuditQueryClient = db,
) {
  const normalizedType = entityType.trim().toLowerCase();
  const take = normalizeLimit(opts.limit, 25);

  const where =
    normalizedType === "account"
      ? {
          OR: [
            { accountId: entityId },
            { entityType: normalizedType, entityId },
          ],
        }
      : normalizedType === "lead"
        ? {
            OR: [
              { leadId: entityId },
              { entityType: normalizedType, entityId },
            ],
          }
        : {
            entityType: normalizedType,
            entityId,
          };

  const rows = await client.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: baseSelect,
  });

  return rows.map(mapAuditLogEntry);
}

export async function getRecentAuditEvents(
  limit = 20,
  client: AuditQueryClient = db,
) {
  const rows = await client.auditLog.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: normalizeLimit(limit, 20),
    select: baseSelect,
  });

  return rows.map(mapAuditLogEntry);
}
