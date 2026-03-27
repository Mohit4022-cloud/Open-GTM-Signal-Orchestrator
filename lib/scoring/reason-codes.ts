import type { ScoreComponentKey, ScoreReasonCode } from "@/lib/contracts/scoring";

type ScoreReasonMetadata = {
  component: ScoreComponentKey;
  label: string;
  description: string;
};

export const scoreReasonMetadata: Record<ScoreReasonCode, ScoreReasonMetadata> = {
  fit_smb_segment: {
    component: "fit",
    label: "SMB segment fit",
    description: "SMB accounts contribute the baseline segment fit allocation.",
  },
  fit_mid_market_segment: {
    component: "fit",
    label: "Mid-market segment fit",
    description: "Mid-market accounts receive a stronger segment fit allocation.",
  },
  fit_enterprise_segment: {
    component: "fit",
    label: "Enterprise segment fit",
    description: "Enterprise accounts receive a high segment fit allocation.",
  },
  fit_strategic_segment: {
    component: "fit",
    label: "Strategic segment fit",
    description: "Strategic accounts receive the maximum segment fit allocation.",
  },
  fit_tier_3: {
    component: "fit",
    label: "Tier 3 account tier",
    description: "Tier 3 accounts receive the smallest account-tier fit allocation.",
  },
  fit_tier_2: {
    component: "fit",
    label: "Tier 2 account tier",
    description: "Tier 2 accounts receive a moderate account-tier fit allocation.",
  },
  fit_tier_1: {
    component: "fit",
    label: "Tier 1 account tier",
    description: "Tier 1 accounts receive a strong account-tier fit allocation.",
  },
  fit_strategic_tier: {
    component: "fit",
    label: "Strategic account tier",
    description: "Strategic-tier accounts receive the maximum account-tier fit allocation.",
  },
  fit_employee_band_0_199: {
    component: "fit",
    label: "Employee band under 200",
    description: "Small employee counts contribute a minimal fit allocation.",
  },
  fit_employee_band_200_499: {
    component: "fit",
    label: "Employee band 200-499",
    description: "Mid-sized employee counts contribute a modest fit allocation.",
  },
  fit_employee_band_500_1999: {
    component: "fit",
    label: "Employee band 500-1999",
    description: "Large employee counts contribute a strong fit allocation.",
  },
  fit_employee_band_2000_plus: {
    component: "fit",
    label: "Employee band 2000+",
    description: "Very large employee counts contribute the maximum fit allocation.",
  },
  fit_revenue_band_20m_50m: {
    component: "fit",
    label: "Revenue band $20M-$50M",
    description: "The current revenue band contributes a light fit allocation.",
  },
  fit_revenue_band_50m_100m: {
    component: "fit",
    label: "Revenue band $50M-$100M",
    description: "The current revenue band contributes a light fit allocation.",
  },
  fit_revenue_band_100m_250m: {
    component: "fit",
    label: "Revenue band $100M-$250M",
    description: "The current revenue band contributes a moderate fit allocation.",
  },
  fit_revenue_band_250m_500m: {
    component: "fit",
    label: "Revenue band $250M-$500M",
    description: "The current revenue band contributes a moderate fit allocation.",
  },
  fit_revenue_band_500m_plus: {
    component: "fit",
    label: "Revenue band $500M+",
    description: "The current revenue band contributes the maximum revenue fit allocation.",
  },
  fit_named_account: {
    component: "fit",
    label: "Named account coverage",
    description: "Named account ownership adds a fit bonus because the account is already in active coverage.",
  },
  fit_account_inheritance: {
    component: "fit",
    label: "Inherited account fit",
    description: "Lead fit inherits a portion of the parent account fit score.",
  },
  fit_seniority_executive: {
    component: "fit",
    label: "Executive seniority",
    description: "Executive-level contacts receive the strongest seniority fit allocation.",
  },
  fit_seniority_vp: {
    component: "fit",
    label: "VP or Head seniority",
    description: "VP and Head contacts receive a strong seniority fit allocation.",
  },
  fit_seniority_director: {
    component: "fit",
    label: "Director seniority",
    description: "Director-level contacts receive a moderate seniority fit allocation.",
  },
  fit_seniority_manager: {
    component: "fit",
    label: "Manager seniority",
    description: "Manager-level contacts receive a light seniority fit allocation.",
  },
  fit_persona_ops: {
    component: "fit",
    label: "Operations persona fit",
    description: "Operations personas map strongly to the product's core GTM workflows.",
  },
  fit_persona_growth: {
    component: "fit",
    label: "Growth persona fit",
    description: "Growth and demand-generation personas map moderately to the product's workflows.",
  },
  fit_persona_other: {
    component: "fit",
    label: "General persona fit",
    description: "Other personas receive a small residual persona fit allocation.",
  },
  intent_pricing_page_cluster: {
    component: "intent",
    label: "Pricing page cluster",
    description: "Repeated pricing and high-intent page visits indicate strong buying research.",
  },
  intent_high_intent_page_cluster: {
    component: "intent",
    label: "High-intent content cluster",
    description: "High-intent page clusters indicate focused buying evaluation.",
  },
  intent_third_party_surge: {
    component: "intent",
    label: "Third-party intent surge",
    description: "External intent providers reported increased research activity.",
  },
  intent_repeat_website_interest: {
    component: "intent",
    label: "Repeat website interest",
    description: "Repeated website visits indicate sustained research activity.",
  },
  intent_webinar_registration: {
    component: "intent",
    label: "Webinar registration",
    description: "Webinar registrations contribute additional buying intent.",
  },
  engagement_form_fill: {
    component: "engagement",
    label: "Form fill",
    description: "Form submissions are treated as strong active engagement.",
  },
  engagement_email_reply: {
    component: "engagement",
    label: "Positive reply",
    description: "Email replies indicate the prospect is actively engaging with outreach.",
  },
  engagement_meeting_booked: {
    component: "engagement",
    label: "Meeting booked",
    description: "Meeting bookings are treated as high-confidence engagement signals.",
  },
  engagement_multithreaded_contacts: {
    component: "engagement",
    label: "Multithreaded engagement",
    description: "Engagement from multiple contacts increases buying confidence.",
  },
  engagement_meeting_no_show: {
    component: "engagement",
    label: "Meeting no-show",
    description: "Meeting no-shows reduce active engagement confidence.",
  },
  recency_event_within_24h: {
    component: "recency",
    label: "Activity within 24 hours",
    description: "Very recent activity receives the maximum recency boost.",
  },
  recency_event_within_3d: {
    component: "recency",
    label: "Activity within 3 days",
    description: "Recent activity within three days receives a strong recency boost.",
  },
  recency_event_within_7d: {
    component: "recency",
    label: "Activity within 7 days",
    description: "Signals in the last week receive a moderate recency boost.",
  },
  recency_event_within_14d: {
    component: "recency",
    label: "Activity within 14 days",
    description: "Signals in the last two weeks receive a light recency boost.",
  },
  inactivity_decay_14d: {
    component: "recency",
    label: "14-day inactivity decay",
    description: "Stale activity older than two weeks reduces score momentum.",
  },
  inactivity_decay_30d: {
    component: "recency",
    label: "30-day inactivity decay",
    description: "No recent activity beyond 30 days applies the maximum decay penalty.",
  },
  product_usage_signup: {
    component: "productUsage",
    label: "Product signup",
    description: "Product signups indicate active product-led interest.",
  },
  product_usage_team_invite: {
    component: "productUsage",
    label: "Team invite",
    description: "Invited teammates indicate the account is broadening product evaluation.",
  },
  product_usage_key_activation: {
    component: "productUsage",
    label: "Key feature activation",
    description: "Activation of a key product milestone increases product usage confidence.",
  },
  manual_priority_boost: {
    component: "manualPriority",
    label: "Manual priority boost",
    description: "A manual operator override added explicit priority weight.",
  },
};

export const scoreReasonCodeValues = Object.keys(scoreReasonMetadata) as ScoreReasonCode[];

export function getScoreReasonMetadata(reasonCode: ScoreReasonCode) {
  return scoreReasonMetadata[reasonCode];
}
