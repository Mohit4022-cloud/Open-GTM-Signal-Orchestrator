export type MetricTone = "default" | "positive" | "warning" | "danger";

export type SelectOption = {
  label: string;
  value: string;
};

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

export type DashboardSummaryContract = {
  asOfIso: string;
  kpis: DashboardKpiContract[];
  signalVolume14d: DashboardTrendPoint[];
  slaHealth: SlaHealthPoint[];
};

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
  lastSignalAtIso: string | null;
  lastSignalAtLabel: string | null;
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

export type ScoreBucket = "hot" | "warm" | "cold";

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
  status: string;
  statusLabel: string;
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
};

export type AccountTimelineEventContract = RecentSignalContract & {
  description: string;
};

export type AccountOpenTaskContract = {
  id: string;
  taskType: string;
  taskTypeLabel: string;
  priority: string;
  priorityLabel: string;
  status: string;
  statusLabel: string;
  title: string;
  description: string;
  dueAtIso: string;
  dueAtLabel: string;
  ownerId: string | null;
  ownerName: string | null;
  isOverdue: boolean;
};

export type ScoreBreakdownItemContract = {
  id: string;
  scoreComponent: string;
  scoreComponentLabel: string;
  value: number;
  reasonCode: string;
};

export type AuditLogItemContract = {
  id: string;
  eventType: string;
  eventTypeLabel: string;
  explanation: string;
  createdAtIso: string;
  createdAtLabel: string;
  actorName: string;
  actorType: string;
  entityType: string;
  entityId: string;
};

export type AccountDetailContract = {
  metadata: AccountMetadataContract;
  namedOwner: NamedOwnerContract | null;
  contacts: ContactContract[];
  relatedLeads: RelatedLeadContract[];
  recentSignals: AccountTimelineEventContract[];
  openTasks: AccountOpenTaskContract[];
  scoreBreakdown: ScoreBreakdownItemContract[];
  auditLog: AuditLogItemContract[];
  summary: string;
};

export type KpiCardValue = Pick<DashboardKpiContract, "label" | "value" | "change" | "tone">;

export type HotAccountRow = {
  id: string;
  name: string;
  owner: string;
  segment: string;
  score: number;
  lastSignalAt: string;
};

export type UnmatchedSignalItem = {
  id: string;
  eventType: string;
  sourceSystem: string;
  receivedAt: string;
  recommendation: string;
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

export type DashboardData = {
  kpis: KpiCardValue[];
  signalVolume14d: DashboardTrendPoint[];
  slaHealth: SlaHealthPoint[];
  hotAccounts: HotAccountRow[];
  unmatchedSignals: UnmatchedSignalItem[];
  recentRoutingDecisions: RoutingFeedItem[];
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
