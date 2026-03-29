import type { Geography, Segment } from "@prisma/client";

import type { TaskPriorityCode } from "@/lib/contracts/actions";
import type { DashboardSlaSummaryContract } from "@/lib/contracts/sla";

export type MetricTone = "default" | "positive" | "warning" | "danger";

export type ScoreBucket = "urgent" | "hot" | "warm" | "cold";

export type DashboardMetricKey =
  | "signalsReceivedToday"
  | "routedToday"
  | "unmatchedSignals"
  | "hotAccounts"
  | "slaBreaches"
  | "averageSpeedToLead";

export type DashboardKpiContract = {
  key: DashboardMetricKey;
  label: string;
  value: string;
  rawValue: number;
  change: string;
  tone: MetricTone;
};

export type DashboardTrendPoint = {
  date: string;
  signals: number;
  matched: number;
};

export type SlaHealthPoint = {
  label: string;
  value: number;
  tone: MetricTone;
};

export type DashboardDemoMetaContract = {
  dataMode: "demo_sample";
  label: string;
  description: string;
  referenceDateIso: string;
  referenceDateLabel: string;
};

export type DashboardFiltersInput = {
  startDate?: string;
  endDate?: string;
  segment?: Segment;
  geography?: Geography;
};

export type DashboardAppliedFiltersContract = {
  startDate: string;
  endDate: string;
  segment: Segment | "";
  geography: Geography | "";
};

export type DashboardSignalVolumeSeriesContract = {
  granularity: "day";
  startDate: string;
  endDate: string;
  totalSignals: number;
  totalMatched: number;
  points: DashboardTrendPoint[];
};

export type DashboardDistributionItemContract = {
  key: string;
  label: string;
  description: string;
  value: number;
  share: number;
};

export type DashboardConversionBucketContract = {
  bucket: ScoreBucket;
  label: string;
  leadCount: number;
  convertedCount: number;
  conversionRate: number;
  averageSpeedToLeadMinutes: number | null;
};

export type DashboardTaskDueItemContract = {
  id: string;
  title: string;
  priorityCode: TaskPriorityCode;
  priorityLabel: string;
  ownerName: string | null;
  accountId: string | null;
  accountName: string | null;
  leadId: string | null;
  dueAtIso: string;
  dueAtLabel: string;
  isOverdue: boolean;
};

export type DashboardTaskDueCollectionContract = {
  totalCount: number;
  rows: DashboardTaskDueItemContract[];
};

export type DashboardBenchmarkMetricBaseContract = {
  key:
    | "averageSpeedToLeadImprovement"
    | "unassignedInboundLeadReduction"
    | "urgentScoreMeetingConversionLift"
    | "manualRoutingEffortReduction";
  label: string;
  displayValue: string;
  value: number;
  explanation: string;
};

export type DashboardDerivedBenchmarkMetricContract =
  DashboardBenchmarkMetricBaseContract & {
    method: "derived";
    formula: string;
    numerator: number;
    denominator: number;
    comparisonLabel: string;
  };

export type DashboardScenarioBenchmarkMetricContract =
  DashboardBenchmarkMetricBaseContract & {
    method: "scenario_benchmark";
    benchmarkLabel: string;
    scenarioLabels: string[];
  };

export type DashboardBenchmarkMetricContract =
  | DashboardDerivedBenchmarkMetricContract
  | DashboardScenarioBenchmarkMetricContract;

export type HotAccountContract = {
  id: string;
  name: string;
  domain: string;
  ownerId: string | null;
  ownerName: string | null;
  segment: string;
  segmentLabel: string;
  status: string;
  statusLabel: string;
  score: number;
  temperature: string;
  temperatureLabel: string;
  scoringVersion: string;
  scoreLastComputedAtIso: string | null;
  lastSignalAtIso: string | null;
  lastSignalAtLabel: string | null;
  headlineReason: string;
  openTaskCount: number;
};

export type RecentSignalContract = {
  id: string;
  eventType: string;
  eventTypeLabel: string;
  sourceSystem: string;
  status: string;
  statusLabel: string;
  occurredAtIso: string;
  occurredAtLabel: string;
  receivedAtIso: string;
  receivedAtLabel: string;
  accountId: string | null;
  accountName: string | null;
  contactId: string | null;
  contactName: string | null;
  leadId: string | null;
  leadDisplay: string | null;
  isUnmatched: boolean;
  recommendedQueue?: string;
};

export type UnmatchedSignalItem = {
  id: string;
  eventType: string;
  sourceSystem: string;
  receivedAt: string;
  recommendation: string;
};

export type UnmatchedSignalsPreviewContract = {
  totalCount: number;
  rows: UnmatchedSignalItem[];
};

export type RoutingFeedItem = {
  id: string;
  accountName: string;
  ownerName: string;
  queue: string;
  decisionType: string;
  createdAt: string;
  explanation: string;
};

export type DashboardSummaryContract = {
  asOfIso: string;
  demoMeta: DashboardDemoMetaContract;
  appliedFilters: DashboardAppliedFiltersContract;
  kpis: DashboardKpiContract[];
  signalVolume14d: DashboardTrendPoint[];
  signalVolumeSeries: DashboardSignalVolumeSeriesContract;
  slaHealth: SlaHealthPoint[];
  slaSummary: DashboardSlaSummaryContract;
  routingReasonDistribution: DashboardDistributionItemContract[];
  conversionByScoreBucket: DashboardConversionBucketContract[];
  hotAccounts: HotAccountContract[];
  recentRoutingDecisions: RoutingFeedItem[];
  unmatchedSignalsPreview: UnmatchedSignalsPreviewContract;
  tasksDueToday: DashboardTaskDueCollectionContract;
  benchmarkMetrics: DashboardBenchmarkMetricContract[];
};

export type KpiCardValue = Pick<
  DashboardKpiContract,
  "label" | "value" | "change" | "tone"
>;

export type HotAccountRow = {
  id: string;
  name: string;
  owner: string;
  segment: string;
  score: number;
  lastSignalAt: string;
};

export type DashboardData = {
  kpis: KpiCardValue[];
  signalVolume14d: DashboardTrendPoint[];
  slaHealth: SlaHealthPoint[];
  hotAccounts: HotAccountRow[];
  unmatchedSignals: UnmatchedSignalItem[];
  recentRoutingDecisions: RoutingFeedItem[];
  demoMeta?: DashboardDemoMetaContract;
  routingReasonDistribution?: DashboardDistributionItemContract[];
  tasksDueToday?: DashboardTaskDueCollectionContract;
  benchmarkMetrics?: DashboardBenchmarkMetricContract[];
};

export type DashboardSlaComplianceTrendPointContract = {
  date: string;
  metCount: number;
  breachedCount: number;
  resolvedAfterBreachCount: number;
};

export type DashboardSlaLeadPreviewItemContract = {
  leadId: string;
  accountId: string | null;
  accountName: string | null;
  ownerName: string | null;
  inboundType: string;
  temperatureLabel: string;
  dueAtIso: string | null;
  dueAtLabel: string | null;
  breachedAtIso: string | null;
};

export type DashboardSlaViewContract = {
  asOfIso: string;
  demoMeta: DashboardDemoMetaContract;
  appliedFilters: DashboardAppliedFiltersContract;
  summary: DashboardSlaSummaryContract;
  slaHealth: SlaHealthPoint[];
  complianceTrend: DashboardSlaComplianceTrendPointContract[];
  breachedLeads: DashboardSlaLeadPreviewItemContract[];
  tasksDueToday: DashboardTaskDueCollectionContract;
};

export type DashboardScoreDistributionContract = {
  accounts: DashboardDistributionItemContract[];
  leads: DashboardDistributionItemContract[];
};

export type DashboardLeadSourceVolumeContract = DashboardDistributionItemContract;

export type DashboardPipelineStageConversionBySegmentContract = {
  segment: Segment;
  segmentLabel: string;
  totalAccounts: number;
  engagedCount: number;
  salesReadyCount: number;
  customerCount: number;
  conversionRate: number;
};

export type DashboardConversionViewContract = {
  asOfIso: string;
  demoMeta: DashboardDemoMetaContract;
  appliedFilters: DashboardAppliedFiltersContract;
  conversionByScoreBucket: DashboardConversionBucketContract[];
  scoreDistribution: DashboardScoreDistributionContract;
  leadVolumeBySource: DashboardLeadSourceVolumeContract[];
  pipelineStageConversionBySegment: DashboardPipelineStageConversionBySegmentContract[];
  benchmarkMetrics: DashboardBenchmarkMetricContract[];
};

export type PublicDashboardSummaryApiErrorCode =
  | "DASHBOARD_SUMMARY_VALIDATION_ERROR"
  | "DASHBOARD_SUMMARY_INTERNAL_ERROR";

export type PublicDashboardSlaApiErrorCode =
  | "DASHBOARD_SLA_VALIDATION_ERROR"
  | "DASHBOARD_SLA_INTERNAL_ERROR";

export type PublicDashboardConversionApiErrorCode =
  | "DASHBOARD_CONVERSION_VALIDATION_ERROR"
  | "DASHBOARD_CONVERSION_INTERNAL_ERROR";

export type PublicDashboardApiErrorResponseContract<
  Code extends
    | PublicDashboardSummaryApiErrorCode
    | PublicDashboardSlaApiErrorCode
    | PublicDashboardConversionApiErrorCode,
> = {
  code: Code;
  message: string;
  error: string | null;
};
