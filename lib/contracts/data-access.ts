import type { ActionCategory } from "@prisma/client";

import type { EntityScoreBreakdownContract, ScoreHistoryRowContract } from "@/lib/contracts/scoring";
import type { AuditLogEntryContract } from "@/lib/contracts/audit";
import type {
  ActionExplanationContract,
  ActionReasonSummaryContract,
  TaskPriorityCode,
} from "@/lib/contracts/actions";
import type {
  RecentSignalContract,
  ScoreBucket,
} from "@/lib/contracts/dashboard";
import type { LeadSlaSnapshotContract, TaskSlaSnapshotContract } from "@/lib/contracts/sla";

export type SelectOption = {
  label: string;
  value: string;
};

export type AccountsFiltersInput = {
  q?: string;
  segment?: string;
  geography?: string;
  owner?: string;
  stage?: string;
  scoreBucket?: ScoreBucket | "";
};

export type AccountsFilterState = {
  q: string;
  segment: string;
  geography: string;
  owner: string;
  stage: string;
  scoreBucket: string;
};

export type AccountsListRowContract = {
  id: string;
  name: string;
  domain: string;
  segment: string;
  segmentLabel: string;
  ownerId: string | null;
  ownerName: string | null;
  geography: string;
  geographyLabel: string;
  stage: string;
  stageLabel: string;
  score: number;
  temperature: string;
  temperatureLabel: string;
  status: string;
  statusLabel: string;
  scoringVersion: string;
  scoreLastComputedAtIso: string | null;
  lastSignalAtIso: string | null;
  lastSignalAtLabel: string | null;
};

export type AccountsListStatsContract = {
  totalAccounts: number;
  averageScore: number;
  hotAccounts: number;
  strategicAccounts: number;
};

export type AccountsListContract = {
  filters: AccountsFilterState;
  stats: AccountsListStatsContract;
  options: {
    owners: SelectOption[];
    segments: SelectOption[];
    geographies: SelectOption[];
    stages: SelectOption[];
    scoreBuckets: SelectOption[];
  };
  rows: AccountsListRowContract[];
};

export type AccountMetadataContract = {
  id: string;
  name: string;
  domain: string;
  industry: string;
  segment: string;
  segmentLabel: string;
  geography: string;
  geographyLabel: string;
  lifecycleStage: string;
  lifecycleStageLabel: string;
  status: string;
  statusLabel: string;
  tier: string;
  tierLabel: string;
  employeeCount: number;
  employeeCountLabel: string;
  annualRevenueBand: string;
  overallScore: number;
  fitScore: number;
  temperature: string;
  temperatureLabel: string;
  scoreLastComputedAtIso: string | null;
  scoringVersion: string;
};

export type NamedOwnerContract = {
  id: string;
  name: string;
  role: string;
  email: string;
  title: string | null;
  geography: string;
  geographyLabel: string;
  team: string;
  avatarColor: string | null;
};

export type ContactContract = {
  id: string;
  fullName: string;
  title: string;
  department: string;
  seniority: string;
  personaType: string;
  email: string;
  phone: string | null;
};

export type RelatedLeadContract = {
  id: string;
  source: string;
  inboundType: string;
  status: string;
  statusLabel: string;
  temperature: string;
  temperatureLabel: string;
  score: number;
  fitScore: number;
  scoringVersion: string;
  scoreLastComputedAtIso: string | null;
  contactId: string | null;
  contactName: string | null;
  currentOwnerId: string | null;
  currentOwnerName: string | null;
  slaDeadlineAtIso: string | null;
  slaDeadlineAtLabel: string | null;
  firstResponseAtIso: string | null;
  firstResponseAtLabel: string | null;
  routedAtIso: string | null;
  routedAtLabel: string | null;
  sla: LeadSlaSnapshotContract;
};

export type AccountTimelineEventContract = RecentSignalContract & {
  description: string;
};

export type AccountOpenTaskContract = {
  id: string;
  taskType: string;
  actionType: string;
  actionCategory: ActionCategory;
  taskTypeLabel: string;
  priority: string;
  priorityCode: TaskPriorityCode;
  priorityLabel: string;
  status: string;
  statusLabel: string;
  title: string;
  description: string;
  dueAtIso: string;
  dueAtLabel: string;
  ownerId: string | null;
  ownerName: string | null;
  reasonSummary: ActionReasonSummaryContract;
  explanation: ActionExplanationContract;
  isOverdue: boolean;
  sla: TaskSlaSnapshotContract;
};

export type ScoreBreakdownItemContract = {
  id: string;
  scoreComponent: string;
  scoreComponentLabel: string;
  value: number;
  reasonCode: string;
};

export type AuditLogItemContract = AuditLogEntryContract;

export type AccountDetailContract = {
  metadata: AccountMetadataContract;
  namedOwner: NamedOwnerContract | null;
  contacts: ContactContract[];
  relatedLeads: RelatedLeadContract[];
  recentSignals: AccountTimelineEventContract[];
  openTasks: AccountOpenTaskContract[];
  score: EntityScoreBreakdownContract;
  scoreHistory: ScoreHistoryRowContract[];
  scoreBreakdown: ScoreBreakdownItemContract[];
  auditLog: AuditLogItemContract[];
  summary: string;
};

export type AccountListRow = {
  id: string;
  name: string;
  domain: string;
  segment: string;
  owner: string;
  geography: string;
  stage: string;
  score: number;
  status: string;
  lastSignalAt: string;
};

export type AccountsListData = {
  filters: AccountsFilterState;
  rows: AccountListRow[];
  stats: AccountsListStatsContract;
  options: {
    owners: SelectOption[];
    segments: SelectOption[];
    geographies: SelectOption[];
    stages: SelectOption[];
    scoreBuckets: SelectOption[];
  };
};

export type TimelineEvent = {
  id: string;
  title: string;
  description: string;
  sourceSystem: string;
  occurredAt: string;
  status: string;
};

export type ContactCard = {
  id: string;
  name: string;
  title: string;
  department: string;
  email: string;
  phone: string | null;
};

export type TaskListItem = {
  id: string;
  title: string;
  description: string;
  dueAt: string;
  priority: string;
  status: string;
  owner: string;
};

export type ScoreBreakdownItem = {
  id: string;
  label: string;
  value: number;
  reasonCode: string;
};

export type AuditLogItem = {
  id: string;
  title: string;
  explanation: string;
  createdAt: string;
  actorName: string;
};

export type AccountDetailView = {
  id: string;
  name: string;
  domain: string;
  owner: string;
  ownerRole: string;
  score: number;
  fitScore: number;
  segment: string;
  geography: string;
  status: string;
  lifecycleStage: string;
  industry: string;
  tier: string;
  employeeCount: string;
  revenueBand: string;
  contacts: ContactCard[];
  openTasks: TaskListItem[];
  timeline: TimelineEvent[];
  scoreBreakdown: ScoreBreakdownItem[];
  auditLog: AuditLogItem[];
  summary: string;
};

export type {
  DashboardAppliedFiltersContract,
  DashboardBenchmarkMetricContract,
  DashboardConversionBucketContract,
  DashboardConversionViewContract,
  DashboardData,
  DashboardDemoMetaContract,
  DashboardDistributionItemContract,
  DashboardFiltersInput,
  DashboardKpiContract,
  DashboardLeadSourceVolumeContract,
  DashboardMetricKey,
  DashboardPipelineStageConversionBySegmentContract,
  DashboardScoreDistributionContract,
  DashboardSignalVolumeSeriesContract,
  DashboardSlaComplianceTrendPointContract,
  DashboardSlaLeadPreviewItemContract,
  DashboardSlaViewContract,
  DashboardSummaryContract,
  DashboardTaskDueCollectionContract,
  DashboardTaskDueItemContract,
  DashboardTrendPoint,
  HotAccountContract,
  HotAccountRow,
  KpiCardValue,
  MetricTone,
  PublicDashboardApiErrorResponseContract,
  PublicDashboardConversionApiErrorCode,
  PublicDashboardSlaApiErrorCode,
  PublicDashboardSummaryApiErrorCode,
  RecentSignalContract,
  RoutingFeedItem,
  ScoreBucket,
  SlaHealthPoint,
  UnmatchedSignalItem,
  UnmatchedSignalsPreviewContract,
} from "@/lib/contracts/dashboard";
