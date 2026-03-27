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
