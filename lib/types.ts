import type { LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  description: string;
  implemented: boolean;
  icon: LucideIcon;
};

export type RouteMeta = {
  title: string;
  subtitle: string;
};

export type ModulePlaceholderConfig = {
  title: string;
  eyebrow: string;
  description: string;
  capabilities: string[];
  teaserLabel: string;
  teaserValue: string;
  secondaryLabel: string;
  secondaryValue: string;
};

export type {
  AccountSummaryMode,
  AccountSummaryRequest,
  AccountSummaryResponseContract,
  AccountSummarySourceSummaryContract,
  ActionNoteMode,
  ActionNoteRequest,
  ActionNoteResponseContract,
  ActionNoteSourceSummaryContract,
  AiAssistStatus,
  AiProviderMetadataContract,
  PublicAiApiErrorCode,
  PublicAiApiErrorResponseContract,
} from "@/lib/contracts/ai";
export type {
  AuditActorContract,
  AuditActorType,
  AuditEntitySummaryContract,
  AuditLogEntryContract,
  AuditLogQueryOptions,
  AuditReasonSummaryContract,
  AuditStateSummaryContract,
  AuditWriteActor,
  AuditWriteEntity,
  AuditWritePayload,
} from "@/lib/contracts/audit";
export type {
  ActionEntityType,
  ActionExplanationContract,
  ActionGenerationRunContract,
  ActionOwnerSummaryContract,
  ActionReasonCode,
  ActionReasonDetailContract,
  ActionReasonSummaryContract,
  ActionRecommendationContract,
  ActionRecommendationsListContract,
  CreateTaskRequest,
  DashboardTaskSummaryContract,
  LinkedEntitySummaryContract,
  PublicActionApiErrorCode,
  PublicActionApiErrorResponseContract,
  PublicTaskApiErrorCode,
  PublicTaskApiErrorResponseContract,
  TaskFiltersInput,
  TaskPriorityCode,
  TaskQueueContract,
  TaskQueueItemContract,
  UpdateTaskRequest,
} from "@/lib/contracts/actions";
export type {
  LeadDetailContract,
  LeadFiltersInput,
  LeadQueueContract,
  LeadQueueItemContract,
  PublicLeadApiErrorCode,
  PublicLeadApiErrorResponseContract,
  UpdateLeadRequest,
} from "@/lib/contracts/leads";
export type {
  AccountDetailContract,
  AccountDetailView,
  AccountListRow,
  AccountOpenTaskContract,
  AccountsFilterState,
  AccountsFiltersInput,
  AccountsListContract,
  AccountsListData,
  AccountsListRowContract,
  AuditLogItem,
  AuditLogItemContract,
  ContactCard,
  ContactContract,
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
  NamedOwnerContract,
  PublicDashboardApiErrorResponseContract,
  PublicDashboardConversionApiErrorCode,
  PublicDashboardSlaApiErrorCode,
  PublicDashboardSummaryApiErrorCode,
  RecentSignalContract,
  RelatedLeadContract,
  RoutingFeedItem,
  ScoreBreakdownItem,
  ScoreBreakdownItemContract,
  ScoreBucket,
  SelectOption,
  SlaHealthPoint,
  TaskListItem,
  TimelineEvent,
  UnmatchedSignalItem,
  UnmatchedSignalsPreviewContract,
} from "@/lib/contracts/data-access";
export type {
  DashboardAggregateSlaMetricsContract,
  DashboardLeadSlaMetricsContract,
  DashboardSlaBucketMetricsContract,
  DashboardSlaSummaryContract,
  LeadSlaSnapshotContract,
  SlaCurrentState,
  SlaEntityType,
  SlaEventContract,
  SlaEventType,
  SlaSnapshotContract,
  TaskSlaSnapshotContract,
} from "@/lib/contracts/sla";
export type {
  AccountTimelineItemContract,
  CanonicalSignalEventContract,
  GetAccountTimelineOptions,
  GetUnmatchedSignalsFilters,
  IdentityResolutionCode,
  IngestSignalInput,
  IngestSignalResult,
  PublicIngestSignalResponseContract,
  PublicSignalApiErrorResponseContract,
  PublicSignalUploadResponseContract,
  RecentSignalFeedItemContract,
  SignalAuditEntryContract,
  SignalDetailContract,
  SignalNormalizedSummaryContract,
  SignalReasonDetailContract,
  UnmatchedSignalQueueItemContract,
  UploadSignalsCsvInput,
  UploadSignalsCsvResult,
} from "@/lib/contracts/signals";
export type {
  EntityScoreBreakdownContract,
  ScoreComponentBreakdownContract,
  ScoreContributorContract,
  ScoreExplanationContract,
  ScoreHistoryListContract,
  ScoreHistoryQueryOptions,
  ScoreHistoryRowContract,
  ScoreReasonDetailContract,
  ScoreReasonCode,
  ScoreRecomputeTriggerContract,
} from "@/lib/contracts/scoring";
