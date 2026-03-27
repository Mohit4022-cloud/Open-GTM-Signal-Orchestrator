import type { ScoreEntityType, ScoreTriggerType, Temperature } from "@prisma/client";

export type ScoreComponentKey =
  | "fit"
  | "intent"
  | "engagement"
  | "recency"
  | "productUsage"
  | "manualPriority";

export type ScoreReasonCode =
  | "fit_smb_segment"
  | "fit_mid_market_segment"
  | "fit_enterprise_segment"
  | "fit_strategic_segment"
  | "fit_tier_3"
  | "fit_tier_2"
  | "fit_tier_1"
  | "fit_strategic_tier"
  | "fit_employee_band_0_199"
  | "fit_employee_band_200_499"
  | "fit_employee_band_500_1999"
  | "fit_employee_band_2000_plus"
  | "fit_revenue_band_20m_50m"
  | "fit_revenue_band_50m_100m"
  | "fit_revenue_band_100m_250m"
  | "fit_revenue_band_250m_500m"
  | "fit_revenue_band_500m_plus"
  | "fit_named_account"
  | "fit_account_inheritance"
  | "fit_seniority_executive"
  | "fit_seniority_vp"
  | "fit_seniority_director"
  | "fit_seniority_manager"
  | "fit_persona_ops"
  | "fit_persona_growth"
  | "fit_persona_other"
  | "intent_pricing_page_cluster"
  | "intent_high_intent_page_cluster"
  | "intent_third_party_surge"
  | "intent_repeat_website_interest"
  | "intent_webinar_registration"
  | "engagement_form_fill"
  | "engagement_email_reply"
  | "engagement_meeting_booked"
  | "engagement_multithreaded_contacts"
  | "engagement_meeting_no_show"
  | "recency_event_within_24h"
  | "recency_event_within_3d"
  | "recency_event_within_7d"
  | "recency_event_within_14d"
  | "inactivity_decay_14d"
  | "inactivity_decay_30d"
  | "product_usage_signup"
  | "product_usage_team_invite"
  | "product_usage_key_activation"
  | "manual_priority_boost";

export type ScoreDirection = "positive" | "negative";

export type ScoreContributorContract = {
  reasonCode: ScoreReasonCode;
  label: string;
  description: string;
  points: number;
  direction: ScoreDirection;
};

export type ScoreComponentBreakdownContract = {
  key: ScoreComponentKey;
  label: string;
  score: number;
  maxScore: number;
  reasonCodes: ScoreReasonCode[];
  contributors: ScoreContributorContract[];
};

export type ScoreExplanationContract = {
  summary: string;
  drivers: string[];
  cautions: string[];
};

export type EntityScoreBreakdownContract = {
  totalScore: number;
  temperature: Temperature;
  componentBreakdown: ScoreComponentBreakdownContract[];
  topReasonCodes: ScoreReasonCode[];
  topContributors: ScoreContributorContract[];
  explanation: ScoreExplanationContract;
  lastUpdatedAtIso: string | null;
  scoringVersion: string;
};

export type ScoreTriggerSummaryContract = {
  signalId: string;
  eventType: string;
  eventTypeLabel: string;
  occurredAtIso: string;
  payloadSummary: string;
};

export type ScoreHistoryRowContract = {
  id: string;
  entityType: ScoreEntityType;
  entityId: string;
  previousScore: number;
  newScore: number;
  delta: number;
  previousTemperature: Temperature;
  newTemperature: Temperature;
  reasonCodes: ScoreReasonCode[];
  componentBreakdown: ScoreComponentBreakdownContract[];
  explanation: ScoreExplanationContract;
  createdAtIso: string;
  scoringVersion: string;
  trigger: {
    type: ScoreTriggerType;
    signalId: string | null;
    metadata: Record<string, unknown> | null;
    signalSummary: ScoreTriggerSummaryContract | null;
  };
};

export type ScoreHistoryListContract = {
  entityType: ScoreEntityType;
  entityId: string;
  rows: ScoreHistoryRowContract[];
};

export type ScoreHistoryQueryOptions = {
  limit?: number;
};

export type ScoreRecomputeTriggerContract = {
  type: ScoreTriggerType;
  signalId?: string | null;
  effectiveAtIso?: string | null;
  actorType?: string;
  actorName?: string;
  note?: string;
  metadata?: Record<string, unknown> | null;
};

export type ScoringConfigContract = {
  version: string;
  componentCaps: Record<ScoreComponentKey, number>;
  thresholds: {
    coldMax: number;
    warmMax: number;
    hotMax: number;
    urgentMin: number;
  };
};
