import type { AuditEventType } from "@prisma/client";

export const auditActorTypeValues = ["system", "user"] as const;

export type AuditActorType = (typeof auditActorTypeValues)[number];

export type AuditActorContract = {
  type: AuditActorType;
  id: string | null;
  name: string;
  summary: string;
};

export type AuditEntitySummaryContract = {
  type: string;
  id: string;
  accountId: string | null;
  leadId: string | null;
  summary: string;
};

export type AuditStateSummaryContract = {
  raw: Record<string, unknown> | null;
  summary: string;
  changedKeys: string[];
};

export type AuditReasonSummaryContract = {
  codes: string[];
  primaryCode: string | null;
  summary: string;
};

export type AuditLogEntryContract = {
  id: string;
  eventType: AuditEventType;
  actionCode: string;
  timestampIso: string;
  timestampLabel: string;
  actor: AuditActorContract;
  action: string;
  entity: AuditEntitySummaryContract;
  before: AuditStateSummaryContract;
  after: AuditStateSummaryContract;
  reason: AuditReasonSummaryContract;
  explanation: string;
};

export type AuditLogQueryOptions = {
  limit?: number;
};

export type AuditWriteActor = {
  type: AuditActorType;
  id: string | null;
  name: string;
};

export type AuditWriteEntity = {
  type: string;
  id: string;
  accountId?: string | null;
  leadId?: string | null;
};

export type AuditWritePayload = {
  eventType: AuditEventType;
  action: string;
  actor: AuditWriteActor;
  entity: AuditWriteEntity;
  explanation: string;
  reasonCodes: string[];
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  createdAt?: Date;
};
