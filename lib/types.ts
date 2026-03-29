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
  DashboardData,
  DashboardKpiContract,
  DashboardMetricKey,
  DashboardSummaryContract,
  DashboardTrendPoint,
  HotAccountContract,
  HotAccountRow,
  KpiCardValue,
  MetricTone,
  NamedOwnerContract,
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
} from "@/lib/contracts/data-access";
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
