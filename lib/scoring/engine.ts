import { AccountTier, Segment } from "@prisma/client";
import { differenceInDays, differenceInHours } from "date-fns";

import type {
  EntityScoreBreakdownContract,
  ScoreComponentBreakdownContract,
  ScoreComponentKey,
  ScoreContributorContract,
  ScoreReasonCode,
  ScoringConfigContract,
} from "@/lib/contracts/scoring";
import { normalizeEntityScoreBreakdown } from "@/lib/scoring/normalize";
import { getScoreReasonMetadata } from "@/lib/scoring/reason-codes";
import { clampTotalScore, deriveTemperature } from "@/lib/scoring/temperature";

import type { AccountScoringInput, LeadScoringInput, LeadScopedSignalMetrics } from "./input-builders";

function formatComponentLabel(component: ScoreComponentKey) {
  switch (component) {
    case "fit":
      return "Fit";
    case "intent":
      return "Intent";
    case "engagement":
      return "Engagement";
    case "recency":
      return "Recency";
    case "productUsage":
      return "Product usage";
    case "manualPriority":
      return "Manual priority";
  }
}

function buildContributor(reasonCode: ScoreReasonCode, points: number): ScoreContributorContract {
  const metadata = getScoreReasonMetadata(reasonCode);

  return {
    reasonCode,
    label: metadata.label,
    description: metadata.description,
    points,
    direction: points >= 0 ? "positive" : "negative",
  };
}

function addPositiveContribution(
  contributors: ScoreContributorContract[],
  remainingCap: number,
  reasonCode: ScoreReasonCode,
  requestedPoints: number,
) {
  const awardedPoints = Math.max(0, Math.min(requestedPoints, remainingCap));

  if (awardedPoints > 0) {
    contributors.push(buildContributor(reasonCode, awardedPoints));
  }

  return Math.max(0, remainingCap - awardedPoints);
}

function addNegativeContribution(
  contributors: ScoreContributorContract[],
  currentScore: number,
  reasonCode: ScoreReasonCode,
  requestedPoints: number,
) {
  const deductedPoints = Math.min(currentScore, Math.abs(requestedPoints));

  if (deductedPoints > 0) {
    contributors.push(buildContributor(reasonCode, -deductedPoints));
  }

  return Math.max(0, currentScore - deductedPoints);
}

function buildComponentBreakdown(
  key: ScoreComponentKey,
  maxScore: number,
  contributors: ScoreContributorContract[],
): ScoreComponentBreakdownContract {
  return {
    key,
    label: formatComponentLabel(key),
    score: contributors.reduce((sum, contributor) => sum + contributor.points, 0),
    maxScore,
    reasonCodes: contributors.map((contributor) => contributor.reasonCode),
    contributors,
  };
}

function getFitSegmentContribution(segment: Segment) {
  switch (segment) {
    case Segment.SMB:
      return { reasonCode: "fit_smb_segment" as const, points: 4 };
    case Segment.MID_MARKET:
      return { reasonCode: "fit_mid_market_segment" as const, points: 7 };
    case Segment.ENTERPRISE:
      return { reasonCode: "fit_enterprise_segment" as const, points: 9 };
    case Segment.STRATEGIC:
      return { reasonCode: "fit_strategic_segment" as const, points: 10 };
  }
}

function getFitTierContribution(accountTier: AccountTier) {
  switch (accountTier) {
    case AccountTier.TIER_3:
      return { reasonCode: "fit_tier_3" as const, points: 1 };
    case AccountTier.TIER_2:
      return { reasonCode: "fit_tier_2" as const, points: 3 };
    case AccountTier.TIER_1:
      return { reasonCode: "fit_tier_1" as const, points: 5 };
    case AccountTier.STRATEGIC:
      return { reasonCode: "fit_strategic_tier" as const, points: 6 };
  }
}

function getEmployeeBandContribution(employeeCount: number) {
  if (employeeCount < 200) {
    return { reasonCode: "fit_employee_band_0_199" as const, points: 1 };
  }

  if (employeeCount < 500) {
    return { reasonCode: "fit_employee_band_200_499" as const, points: 2 };
  }

  if (employeeCount < 2000) {
    return { reasonCode: "fit_employee_band_500_1999" as const, points: 3 };
  }

  return { reasonCode: "fit_employee_band_2000_plus" as const, points: 4 };
}

function getRevenueBandContribution(annualRevenueBand: string) {
  switch (annualRevenueBand) {
    case "$20M-$50M":
      return { reasonCode: "fit_revenue_band_20m_50m" as const, points: 1 };
    case "$50M-$100M":
      return { reasonCode: "fit_revenue_band_50m_100m" as const, points: 1 };
    case "$100M-$250M":
      return { reasonCode: "fit_revenue_band_100m_250m" as const, points: 2 };
    case "$250M-$500M":
      return { reasonCode: "fit_revenue_band_250m_500m" as const, points: 2 };
    case "$500M+":
      return { reasonCode: "fit_revenue_band_500m_plus" as const, points: 3 };
    default:
      return null;
  }
}

function getSeniorityContribution(seniority: string) {
  const normalized = seniority.toLowerCase();

  if (/(executive|chief|cxo|cro|cco)/.test(normalized)) {
    return { reasonCode: "fit_seniority_executive" as const, points: 5 };
  }

  if (/(vice president|vp|head)/.test(normalized)) {
    return { reasonCode: "fit_seniority_vp" as const, points: 4 };
  }

  if (normalized.includes("director")) {
    return { reasonCode: "fit_seniority_director" as const, points: 3 };
  }

  if (normalized.includes("manager")) {
    return { reasonCode: "fit_seniority_manager" as const, points: 1 };
  }

  return null;
}

function getPersonaContribution(personaType: string) {
  const normalized = personaType.toLowerCase();

  if (
    /(revops|revenue ops|gtm systems|commercial ops|sales ops|growth ops|commercial systems|ecommerce ops)/.test(
      normalized,
    )
  ) {
    return { reasonCode: "fit_persona_ops" as const, points: 5 };
  }

  if (/(growth|demand gen|marketing leader)/.test(normalized)) {
    return { reasonCode: "fit_persona_growth" as const, points: 3 };
  }

  return { reasonCode: "fit_persona_other" as const, points: 1 };
}

function getRecencyContribution(lastSignalAt: Date | null, now: Date) {
  if (!lastSignalAt) {
    return buildContributor("inactivity_decay_30d", -10);
  }

  const hoursSinceLastSignal = differenceInHours(now, lastSignalAt);
  const daysSinceLastSignal = differenceInDays(now, lastSignalAt);

  if (hoursSinceLastSignal <= 24) {
    return buildContributor("recency_event_within_24h", 10);
  }

  if (daysSinceLastSignal <= 3) {
    return buildContributor("recency_event_within_3d", 8);
  }

  if (daysSinceLastSignal <= 7) {
    return buildContributor("recency_event_within_7d", 6);
  }

  if (daysSinceLastSignal <= 14) {
    return buildContributor("recency_event_within_14d", 2);
  }

  if (daysSinceLastSignal <= 30) {
    return buildContributor("inactivity_decay_14d", -4);
  }

  return buildContributor("inactivity_decay_30d", -10);
}

function buildTopContributors(componentBreakdown: ScoreComponentBreakdownContract[]) {
  return componentBreakdown
    .flatMap((component) => component.contributors)
    .sort((left, right) => {
      const pointDelta = Math.abs(right.points) - Math.abs(left.points);
      if (pointDelta !== 0) {
        return pointDelta;
      }

      return left.label.localeCompare(right.label);
    });
}

function buildExplanation(totalScore: number, topContributors: ScoreContributorContract[], temperatureLabel: string) {
  const positiveDrivers = topContributors.filter((contributor) => contributor.points > 0).slice(0, 3);
  const cautionDrivers = topContributors.filter((contributor) => contributor.points < 0).slice(0, 2);
  const driverLabels = positiveDrivers.map((contributor) => contributor.label);
  const cautionLabels = cautionDrivers.map((contributor) => contributor.label);
  const positiveSummary =
    driverLabels.length > 0 ? `Top drivers: ${driverLabels.join(", ")}.` : "No positive drivers are currently active.";
  const cautionSummary =
    cautionLabels.length > 0 ? ` Watchouts: ${cautionLabels.join(", ")}.` : "";

  return {
    summary: `Score is ${totalScore}/100 and currently ${temperatureLabel.toLowerCase()}. ${positiveSummary}${cautionSummary}`.trim(),
    drivers: driverLabels,
    cautions: cautionLabels,
  };
}

function computeAccountFitComponent(
  input: AccountScoringInput,
  config: ScoringConfigContract,
) {
  const contributors: ScoreContributorContract[] = [];
  let remainingCap = config.componentCaps.fit;
  const segmentContribution = getFitSegmentContribution(input.segment);
  const tierContribution = getFitTierContribution(input.accountTier);
  const employeeContribution = getEmployeeBandContribution(input.employeeCount);
  const revenueContribution = getRevenueBandContribution(input.annualRevenueBand);

  remainingCap = addPositiveContribution(
    contributors,
    remainingCap,
    segmentContribution.reasonCode,
    segmentContribution.points,
  );
  remainingCap = addPositiveContribution(
    contributors,
    remainingCap,
    tierContribution.reasonCode,
    tierContribution.points,
  );
  remainingCap = addPositiveContribution(
    contributors,
    remainingCap,
    employeeContribution.reasonCode,
    employeeContribution.points,
  );

  if (revenueContribution) {
    remainingCap = addPositiveContribution(
      contributors,
      remainingCap,
      revenueContribution.reasonCode,
      revenueContribution.points,
    );
  }

  if (input.hasNamedOwner) {
    remainingCap = addPositiveContribution(contributors, remainingCap, "fit_named_account", 2);
  }

  return buildComponentBreakdown("fit", config.componentCaps.fit, contributors);
}

function computeAccountIntentComponent(input: AccountScoringInput, config: ScoringConfigContract) {
  const contributors: ScoreContributorContract[] = [];
  let remainingCap = config.componentCaps.intent;
  const { signalMetrics } = input;

  if (signalMetrics.pricingVisitCount7d >= 3) {
    remainingCap = addPositiveContribution(contributors, remainingCap, "intent_pricing_page_cluster", 8);
  } else if (signalMetrics.pricingVisitCount7d >= 2) {
    remainingCap = addPositiveContribution(contributors, remainingCap, "intent_pricing_page_cluster", 4);
  }

  if (signalMetrics.highIntentClusterCount14d > 0) {
    remainingCap = addPositiveContribution(
      contributors,
      remainingCap,
      "intent_high_intent_page_cluster",
      4,
    );
  }

  if (signalMetrics.thirdPartyIntentCount30d > 0) {
    remainingCap = addPositiveContribution(contributors, remainingCap, "intent_third_party_surge", 4);
  }

  if (signalMetrics.websiteVisitCount14d >= 5) {
    remainingCap = addPositiveContribution(
      contributors,
      remainingCap,
      "intent_repeat_website_interest",
      2,
    );
  }

  if (signalMetrics.webinarRegistrationCount30d > 0) {
    remainingCap = addPositiveContribution(
      contributors,
      remainingCap,
      "intent_webinar_registration",
      2,
    );
  }

  return buildComponentBreakdown("intent", config.componentCaps.intent, contributors);
}

function computeAccountEngagementComponent(input: AccountScoringInput, config: ScoringConfigContract) {
  const contributors: ScoreContributorContract[] = [];
  let remainingCap = config.componentCaps.engagement;
  const { signalMetrics } = input;

  if (signalMetrics.formFillCount30d > 0) {
    remainingCap = addPositiveContribution(contributors, remainingCap, "engagement_form_fill", 8);
  }

  if (signalMetrics.emailReplyCount30d > 0) {
    remainingCap = addPositiveContribution(contributors, remainingCap, "engagement_email_reply", 7);
  }

  if (signalMetrics.meetingBookedCount30d > 0) {
    remainingCap = addPositiveContribution(contributors, remainingCap, "engagement_meeting_booked", 8);
  }

  if (signalMetrics.engagedContactCount30d >= 2) {
    remainingCap = addPositiveContribution(
      contributors,
      remainingCap,
      "engagement_multithreaded_contacts",
      4,
    );
  }

  if (signalMetrics.meetingNoShowCount30d > 0) {
    const currentScore = contributors.reduce((sum, contributor) => sum + contributor.points, 0);
    addNegativeContribution(contributors, currentScore, "engagement_meeting_no_show", -4);
  }

  return buildComponentBreakdown("engagement", config.componentCaps.engagement, contributors);
}

function computeAccountProductUsageComponent(input: AccountScoringInput, config: ScoringConfigContract) {
  const contributors: ScoreContributorContract[] = [];
  let remainingCap = config.componentCaps.productUsage;
  const { signalMetrics } = input;

  if (signalMetrics.productSignupCount30d > 0) {
    remainingCap = addPositiveContribution(contributors, remainingCap, "product_usage_signup", 6);
  }

  if (signalMetrics.teamInviteCount30d > 0) {
    remainingCap = addPositiveContribution(contributors, remainingCap, "product_usage_team_invite", 4);
  }

  if (signalMetrics.keyActivationCount30d > 0) {
    remainingCap = addPositiveContribution(
      contributors,
      remainingCap,
      "product_usage_key_activation",
      5,
    );
  }

  return buildComponentBreakdown("productUsage", config.componentCaps.productUsage, contributors);
}

function computeManualPriorityComponent(
  manualPriorityBoost: number,
  config: ScoringConfigContract,
) {
  const boost = Math.max(0, Math.min(config.componentCaps.manualPriority, manualPriorityBoost));
  const contributors = boost > 0 ? [buildContributor("manual_priority_boost", boost)] : [];
  return buildComponentBreakdown("manualPriority", config.componentCaps.manualPriority, contributors);
}

function computeScopedReasonPoints(
  directValue: number,
  inheritedValue: number,
  fullPoints: number,
) {
  if (directValue > 0) {
    return fullPoints;
  }

  if (inheritedValue > 0) {
    return Math.floor(fullPoints / 2);
  }

  return 0;
}

function pickLeadRecencyContributor(
  directMetrics: LeadScopedSignalMetrics,
  inheritedMetrics: LeadScopedSignalMetrics,
  now: Date,
) {
  const directRecency = getRecencyContribution(directMetrics.lastSignalAt, now);
  if (directMetrics.lastSignalAt) {
    return directRecency;
  }

  const inheritedRecency = getRecencyContribution(inheritedMetrics.lastSignalAt, now);
  if (inheritedMetrics.lastSignalAt && inheritedRecency.points > 0) {
    return buildContributor(inheritedRecency.reasonCode, Math.floor(inheritedRecency.points / 2));
  }

  return inheritedRecency;
}

function computeLeadFitComponent(input: LeadScoringInput, config: ScoringConfigContract) {
  const contributors: ScoreContributorContract[] = [];
  let remainingCap = config.componentCaps.fit;
  const inheritedFitScore = Math.min(15, Math.round(input.accountFitScore * 0.6));
  const seniorityContribution = getSeniorityContribution(input.seniority);
  const personaContribution = getPersonaContribution(input.personaType);

  if (inheritedFitScore > 0) {
    remainingCap = addPositiveContribution(
      contributors,
      remainingCap,
      "fit_account_inheritance",
      inheritedFitScore,
    );
  }

  if (seniorityContribution) {
    remainingCap = addPositiveContribution(
      contributors,
      remainingCap,
      seniorityContribution.reasonCode,
      seniorityContribution.points,
    );
  }

  remainingCap = addPositiveContribution(
    contributors,
    remainingCap,
    personaContribution.reasonCode,
    personaContribution.points,
  );

  return buildComponentBreakdown("fit", config.componentCaps.fit, contributors);
}

function computeLeadIntentComponent(input: LeadScoringInput, config: ScoringConfigContract) {
  const contributors: ScoreContributorContract[] = [];
  let remainingCap = config.componentCaps.intent;

  const pricingPoints =
    input.directSignalMetrics.pricingVisitCount7d >= 3
      ? 8
      : input.directSignalMetrics.pricingVisitCount7d >= 2
        ? 4
        : input.inheritedSignalMetrics.pricingVisitCount7d >= 3
          ? 4
          : input.inheritedSignalMetrics.pricingVisitCount7d >= 2
            ? 2
            : 0;
  if (pricingPoints > 0) {
    remainingCap = addPositiveContribution(contributors, remainingCap, "intent_pricing_page_cluster", pricingPoints);
  }

  const highIntentPoints = computeScopedReasonPoints(
    input.directSignalMetrics.highIntentClusterCount14d,
    input.inheritedSignalMetrics.highIntentClusterCount14d,
    4,
  );
  if (highIntentPoints > 0) {
    remainingCap = addPositiveContribution(
      contributors,
      remainingCap,
      "intent_high_intent_page_cluster",
      highIntentPoints,
    );
  }

  const thirdPartyPoints = computeScopedReasonPoints(
    input.directSignalMetrics.thirdPartyIntentCount30d,
    input.inheritedSignalMetrics.thirdPartyIntentCount30d,
    4,
  );
  if (thirdPartyPoints > 0) {
    remainingCap = addPositiveContribution(contributors, remainingCap, "intent_third_party_surge", thirdPartyPoints);
  }

  const websitePoints =
    input.directSignalMetrics.websiteVisitCount14d >= 5
      ? 2
      : input.inheritedSignalMetrics.websiteVisitCount14d >= 5
        ? 1
        : 0;
  if (websitePoints > 0) {
    remainingCap = addPositiveContribution(
      contributors,
      remainingCap,
      "intent_repeat_website_interest",
      websitePoints,
    );
  }

  const webinarPoints = computeScopedReasonPoints(
    input.directSignalMetrics.webinarRegistrationCount30d,
    input.inheritedSignalMetrics.webinarRegistrationCount30d,
    2,
  );
  if (webinarPoints > 0) {
    remainingCap = addPositiveContribution(
      contributors,
      remainingCap,
      "intent_webinar_registration",
      webinarPoints,
    );
  }

  return buildComponentBreakdown("intent", config.componentCaps.intent, contributors);
}

function computeLeadEngagementComponent(input: LeadScoringInput, config: ScoringConfigContract) {
  const contributors: ScoreContributorContract[] = [];
  let remainingCap = config.componentCaps.engagement;

  const formFillPoints = computeScopedReasonPoints(
    input.directSignalMetrics.formFillCount30d,
    input.inheritedSignalMetrics.formFillCount30d,
    8,
  );
  if (formFillPoints > 0) {
    remainingCap = addPositiveContribution(contributors, remainingCap, "engagement_form_fill", formFillPoints);
  }

  const emailReplyPoints = computeScopedReasonPoints(
    input.directSignalMetrics.emailReplyCount30d,
    input.inheritedSignalMetrics.emailReplyCount30d,
    7,
  );
  if (emailReplyPoints > 0) {
    remainingCap = addPositiveContribution(
      contributors,
      remainingCap,
      "engagement_email_reply",
      emailReplyPoints,
    );
  }

  const meetingBookedPoints = computeScopedReasonPoints(
    input.directSignalMetrics.meetingBookedCount30d,
    input.inheritedSignalMetrics.meetingBookedCount30d,
    8,
  );
  if (meetingBookedPoints > 0) {
    remainingCap = addPositiveContribution(
      contributors,
      remainingCap,
      "engagement_meeting_booked",
      meetingBookedPoints,
    );
  }

  const multithreadPoints =
    input.directSignalMetrics.engagedContactCount30d >= 2
      ? 4
      : input.inheritedSignalMetrics.engagedContactCount30d >= 2
        ? 2
        : 0;
  if (multithreadPoints > 0) {
    remainingCap = addPositiveContribution(
      contributors,
      remainingCap,
      "engagement_multithreaded_contacts",
      multithreadPoints,
    );
  }

  const noShowPoints = computeScopedReasonPoints(
    input.directSignalMetrics.meetingNoShowCount30d,
    input.inheritedSignalMetrics.meetingNoShowCount30d,
    4,
  );
  if (noShowPoints > 0) {
    const currentScore = contributors.reduce((sum, contributor) => sum + contributor.points, 0);
    addNegativeContribution(contributors, currentScore, "engagement_meeting_no_show", -noShowPoints);
  }

  return buildComponentBreakdown("engagement", config.componentCaps.engagement, contributors);
}

function computeLeadProductUsageComponent(input: LeadScoringInput, config: ScoringConfigContract) {
  const contributors: ScoreContributorContract[] = [];
  let remainingCap = config.componentCaps.productUsage;

  const signupPoints = computeScopedReasonPoints(
    input.directSignalMetrics.productSignupCount30d,
    input.inheritedSignalMetrics.productSignupCount30d,
    6,
  );
  if (signupPoints > 0) {
    remainingCap = addPositiveContribution(contributors, remainingCap, "product_usage_signup", signupPoints);
  }

  const teamInvitePoints = computeScopedReasonPoints(
    input.directSignalMetrics.teamInviteCount30d,
    input.inheritedSignalMetrics.teamInviteCount30d,
    4,
  );
  if (teamInvitePoints > 0) {
    remainingCap = addPositiveContribution(
      contributors,
      remainingCap,
      "product_usage_team_invite",
      teamInvitePoints,
    );
  }

  const keyActivationPoints = computeScopedReasonPoints(
    input.directSignalMetrics.keyActivationCount30d,
    input.inheritedSignalMetrics.keyActivationCount30d,
    5,
  );
  if (keyActivationPoints > 0) {
    remainingCap = addPositiveContribution(
      contributors,
      remainingCap,
      "product_usage_key_activation",
      keyActivationPoints,
    );
  }

  return buildComponentBreakdown("productUsage", config.componentCaps.productUsage, contributors);
}

function buildEntityScoreBreakdown(
  componentBreakdown: ScoreComponentBreakdownContract[],
  config: ScoringConfigContract,
  now: Date,
): EntityScoreBreakdownContract {
  const rawTotalScore = componentBreakdown.reduce((sum, component) => sum + component.score, 0);
  const totalScore = clampTotalScore(rawTotalScore);
  const temperature = deriveTemperature(totalScore, config.thresholds);
  const topContributors = buildTopContributors(componentBreakdown);

  return normalizeEntityScoreBreakdown({
    totalScore,
    temperature,
    componentBreakdown,
    explanation: buildExplanation(totalScore, topContributors, temperature),
    lastUpdatedAtIso: now.toISOString(),
    scoringVersion: config.version,
  });
}

export function computeAccountScore(
  input: AccountScoringInput,
  config: ScoringConfigContract,
  now: Date,
) {
  const fit = computeAccountFitComponent(input, config);
  const intent = computeAccountIntentComponent(input, config);
  const engagement = computeAccountEngagementComponent(input, config);
  const recency = buildComponentBreakdown("recency", config.componentCaps.recency, [
    getRecencyContribution(input.signalMetrics.lastSignalAt, now),
  ]);
  const productUsage = computeAccountProductUsageComponent(input, config);
  const manualPriority = computeManualPriorityComponent(input.manualPriorityBoost, config);

  return buildEntityScoreBreakdown([fit, intent, engagement, recency, productUsage, manualPriority], config, now);
}

export function computeLeadScore(
  input: LeadScoringInput,
  config: ScoringConfigContract,
  now: Date,
) {
  const fit = computeLeadFitComponent(input, config);
  const intent = computeLeadIntentComponent(input, config);
  const engagement = computeLeadEngagementComponent(input, config);
  const recency = buildComponentBreakdown("recency", config.componentCaps.recency, [
    pickLeadRecencyContributor(input.directSignalMetrics, input.inheritedSignalMetrics, now),
  ]);
  const productUsage = computeLeadProductUsageComponent(input, config);
  const manualPriority = computeManualPriorityComponent(input.manualPriorityBoost, config);

  return buildEntityScoreBreakdown([fit, intent, engagement, recency, productUsage, manualPriority], config, now);
}
