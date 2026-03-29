import {
  ActionCategory,
  ActionType,
  TaskPriority,
  TaskStatus,
  TaskType,
} from "@prisma/client";

import type { SlaCurrentState, TaskSlaSnapshotContract } from "@/lib/contracts/sla";

export const actionEntityTypeValues = ["lead", "account"] as const;

export type ActionEntityType = (typeof actionEntityTypeValues)[number];

export const taskPriorityCodeValues = ["P1", "P2", "P3", "P4"] as const;

export type TaskPriorityCode = (typeof taskPriorityCodeValues)[number];

export const actionReasonCodeValues = [
  "urgent_inbound_requires_immediate_call",
  "follow_up_email_required_after_demo_request",
  "strategic_account_requires_ae_handoff",
  "warm_pricing_activity_requires_research",
  "warm_pricing_activity_recommended_for_nurture",
  "missing_contact_data_requires_enrichment",
  "product_qualified_requires_success_handoff",
  "product_qualified_account_summary_recommended",
  "active_account_pause_recommended",
  "sla_breach_requires_escalation",
  "duplicate_action_prevented",
  "manual_task_created",
] as const;

export type ActionReasonCode = (typeof actionReasonCodeValues)[number];

export type ActionReasonCategory =
  | "sla"
  | "follow_up"
  | "routing"
  | "intent"
  | "product"
  | "data_quality"
  | "state"
  | "duplicate"
  | "manual";

export type ActionReasonDetailContract = {
  code: ActionReasonCode;
  label: string;
  description: string;
  category: ActionReasonCategory;
};

export type ActionReasonSummaryContract = {
  primaryCode: ActionReasonCode;
  primaryLabel: string;
  summary: string;
  relatedReasonCodes: ActionReasonCode[];
};

export type ActionOwnerSummaryContract = {
  id: string;
  name: string;
  role: string;
  team: string;
};

export type LinkedEntitySummaryContract = {
  entityType: ActionEntityType;
  entityId: string;
  accountId: string | null;
  accountName: string | null;
  leadId: string | null;
  leadLabel: string | null;
  contactId: string | null;
  contactName: string | null;
};

export type ActionTriggerReferencesContract = {
  signalId: string | null;
  routingDecisionId: string | null;
  scoreHistoryId: string | null;
};

export type ActionExplanationContract = {
  summary: string;
  reasonCodes: ActionReasonCode[];
  reasonDetails: ActionReasonDetailContract[];
  trigger: ActionTriggerReferencesContract;
  context: {
    entityType: ActionEntityType;
    entityId: string;
    accountId: string | null;
    leadId: string | null;
    temperature: string | null;
    inboundType: string | null;
    lifecycleStage: string | null;
    assignedQueue: string | null;
    isStrategic: boolean;
    activeAccount: boolean;
  };
  dueAtIso: string | null;
  dedupeKey: string | null;
};

export type TaskQueueItemContract = {
  id: string;
  title: string;
  description: string;
  taskType: TaskType;
  actionType: ActionType;
  actionCategory: ActionCategory;
  priorityCode: TaskPriorityCode;
  priorityLabel: string;
  status: TaskStatus;
  dueAtIso: string;
  createdAtIso: string;
  completedAtIso: string | null;
  owner: ActionOwnerSummaryContract | null;
  linkedEntity: LinkedEntitySummaryContract;
  reasonSummary: ActionReasonSummaryContract;
  explanation: ActionExplanationContract;
  isOverdue: boolean;
  sla: TaskSlaSnapshotContract;
};

export type DashboardTaskSummaryContract = {
  asOfIso: string;
  openCount: number;
  inProgressCount: number;
  overdueCount: number;
  urgentCount: number;
  unassignedCount: number;
  trackedSlaCount: number;
  breachedCount: number;
  dueSoonCount: number;
};

export type TaskFiltersInput = {
  ownerId?: string;
  status?: TaskStatus | TaskStatus[];
  priorityCode?: TaskPriorityCode | TaskPriorityCode[];
  overdue?: boolean;
  tracked?: boolean;
  slaState?: SlaCurrentState | SlaCurrentState[];
  entityType?: ActionEntityType;
  entityId?: string;
};

export type TaskQueueContract = {
  filters: {
    ownerId: string;
    statuses: TaskStatus[];
    priorityCodes: TaskPriorityCode[];
    overdue: boolean | null;
    tracked: boolean | null;
    slaStates: SlaCurrentState[];
    entityType: ActionEntityType | "";
    entityId: string;
  };
  totalCount: number;
  rows: TaskQueueItemContract[];
};

export type ActionRecommendationContract = {
  id: string;
  recommendationType: ActionType;
  actionCategory: ActionCategory;
  severityCode: TaskPriorityCode;
  severityLabel: string;
  title: string;
  explanation: ActionExplanationContract;
  suggestedOwner: ActionOwnerSummaryContract | null;
  suggestedQueue: string | null;
  linkedEntity: LinkedEntitySummaryContract;
  createdAtIso: string;
};

export type ActionRecommendationsListContract = {
  entityType: ActionEntityType;
  entityId: string;
  rows: ActionRecommendationContract[];
};

export type ActionGenerationRunContract = {
  entityType: ActionEntityType;
  entityId: string;
  generatedAtIso: string;
  createdTaskIds: string[];
  createdRecommendationIds: string[];
  preventedDuplicateKeys: string[];
  skippedReasonCodes: ActionReasonCode[];
};

export type CreateTaskRequest = {
  leadId?: string;
  accountId?: string;
  ownerId?: string | null;
  taskType: TaskType;
  priorityCode: TaskPriorityCode;
  dueAtIso: string;
  title: string;
  description: string;
  status?: TaskStatus;
};

export type UpdateTaskRequest = {
  ownerId?: string | null;
  priorityCode?: TaskPriorityCode;
  dueAtIso?: string;
  title?: string;
  description?: string;
  status?: TaskStatus;
};

export type PublicTaskApiErrorCode =
  | "TASK_VALIDATION_ERROR"
  | "TASK_NOT_FOUND"
  | "TASK_INTERNAL_ERROR";

export type PublicTaskApiErrorResponseContract = {
  code: PublicTaskApiErrorCode;
  message: string;
  error: string | null;
};

export type PublicActionApiErrorCode =
  | "ACTION_VALIDATION_ERROR"
  | "ACTION_NOT_FOUND"
  | "ACTION_INTERNAL_ERROR";

export type PublicActionApiErrorResponseContract = {
  code: PublicActionApiErrorCode;
  message: string;
  error: string | null;
};

export const priorityCodeByValue: Record<TaskPriority, TaskPriorityCode> = {
  URGENT: "P1",
  HIGH: "P2",
  MEDIUM: "P3",
  LOW: "P4",
};

export const priorityLabelByCode: Record<TaskPriorityCode, string> = {
  P1: "Urgent",
  P2: "High",
  P3: "Normal",
  P4: "Low",
};

export const priorityValueByCode: Record<TaskPriorityCode, TaskPriority> = {
  P1: TaskPriority.URGENT,
  P2: TaskPriority.HIGH,
  P3: TaskPriority.MEDIUM,
  P4: TaskPriority.LOW,
};
