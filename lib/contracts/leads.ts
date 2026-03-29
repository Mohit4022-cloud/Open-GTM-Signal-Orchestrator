import type { LeadStatus, Temperature } from "@prisma/client";

import type { LeadSlaSnapshotContract, SlaCurrentState, SlaEventContract } from "@/lib/contracts/sla";

export type LeadFiltersInput = {
  ownerId?: string;
  status?: LeadStatus | LeadStatus[];
  temperature?: Temperature | Temperature[];
  slaState?: SlaCurrentState | SlaCurrentState[];
  tracked?: boolean;
  overdue?: boolean;
  hot?: boolean;
  unassigned?: boolean;
  recentlyRouted?: boolean;
};

export type LeadQueueRoutingContract = {
  currentQueue: string | null;
  routedAtIso: string | null;
};

export type LeadQueueFlagsContract = {
  isHot: boolean;
  isOverdueSla: boolean;
  isUnassigned: boolean;
  isRecentlyRouted: boolean;
};

export type LeadQueueItemContract = {
  id: string;
  accountId: string;
  accountName: string;
  contactId: string | null;
  contactName: string | null;
  currentOwnerId: string | null;
  currentOwnerName: string | null;
  source: string;
  inboundType: string;
  status: LeadStatus;
  temperature: Temperature;
  score: number;
  createdAtIso: string;
  updatedAtIso: string;
  routing: LeadQueueRoutingContract;
  queueFlags: LeadQueueFlagsContract;
  sla: LeadSlaSnapshotContract;
};

export type LeadQueueContract = {
  filters: {
    ownerId: string;
    statuses: LeadStatus[];
    temperatures: Temperature[];
    slaStates: SlaCurrentState[];
    tracked: boolean | null;
    overdue: boolean | null;
    hot: boolean | null;
    unassigned: boolean | null;
    recentlyRouted: boolean | null;
  };
  totalCount: number;
  rows: LeadQueueItemContract[];
};

export type LeadDetailContract = LeadQueueItemContract & {
  firstResponseAtIso: string | null;
  routedAtIso: string | null;
  timelineSummary: string;
  events: SlaEventContract[];
};

export type UpdateLeadRequest = {
  status?: LeadStatus;
  firstResponseAtIso?: string;
};

export type PublicLeadApiErrorCode =
  | "LEAD_VALIDATION_ERROR"
  | "LEAD_NOT_FOUND"
  | "LEAD_INTERNAL_ERROR";

export type PublicLeadApiErrorResponseContract = {
  code: PublicLeadApiErrorCode;
  message: string;
  error: string | null;
};
