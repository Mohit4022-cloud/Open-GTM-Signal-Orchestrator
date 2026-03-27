import { AccountTier, Segment, SignalType } from "@prisma/client";
import { subDays } from "date-fns";

type ScoringSignalFact = {
  eventType: SignalType;
  occurredAt: Date;
  contactId: string | null;
  leadId: string | null;
  normalizedPayloadJson: unknown;
};

type AccountSignalMetrics = {
  lastSignalAt: Date | null;
  pricingVisitCount7d: number;
  highIntentClusterCount14d: number;
  thirdPartyIntentCount30d: number;
  websiteVisitCount14d: number;
  webinarRegistrationCount30d: number;
  formFillCount30d: number;
  emailReplyCount30d: number;
  meetingBookedCount30d: number;
  meetingNoShowCount30d: number;
  engagedContactCount30d: number;
  productSignupCount30d: number;
  teamInviteCount30d: number;
  keyActivationCount30d: number;
};

export type AccountScoringInput = {
  segment: Segment;
  accountTier: AccountTier;
  employeeCount: number;
  annualRevenueBand: string;
  hasNamedOwner: boolean;
  manualPriorityBoost: number;
  signalMetrics: AccountSignalMetrics;
};

export type LeadScopedSignalMetrics = {
  lastSignalAt: Date | null;
  pricingVisitCount7d: number;
  highIntentClusterCount14d: number;
  thirdPartyIntentCount30d: number;
  websiteVisitCount14d: number;
  webinarRegistrationCount30d: number;
  formFillCount30d: number;
  emailReplyCount30d: number;
  meetingBookedCount30d: number;
  meetingNoShowCount30d: number;
  engagedContactCount30d: number;
  productSignupCount30d: number;
  teamInviteCount30d: number;
  keyActivationCount30d: number;
};

export type LeadScoringInput = {
  accountFitScore: number;
  seniority: string;
  personaType: string;
  manualPriorityBoost: number;
  directSignalMetrics: LeadScopedSignalMetrics;
  inheritedSignalMetrics: LeadScopedSignalMetrics;
};

type AccountInputParams = {
  segment: Segment;
  accountTier: AccountTier;
  employeeCount: number;
  annualRevenueBand: string;
  namedOwnerId: string | null;
  manualPriorityBoost: number;
  signals: ScoringSignalFact[];
  now: Date;
};

type LeadInputParams = {
  accountFitScore: number;
  seniority: string;
  personaType: string;
  contactId: string | null;
  leadId: string;
  manualPriorityBoost: number;
  signals: ScoringSignalFact[];
  now: Date;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getNormalizedRawReference(signal: ScoringSignalFact) {
  if (!isObjectRecord(signal.normalizedPayloadJson)) {
    return {};
  }

  const rawReference = signal.normalizedPayloadJson.rawReference;
  if (!isObjectRecord(rawReference)) {
    return {};
  }

  return rawReference;
}

function getRawReferenceValue(signal: ScoringSignalFact, keys: string[]) {
  const rawReference = getNormalizedRawReference(signal);

  for (const key of keys) {
    const value = rawReference[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim().toLowerCase();
    }
  }

  return null;
}

function buildEmptyMetrics(): AccountSignalMetrics {
  return {
    lastSignalAt: null,
    pricingVisitCount7d: 0,
    highIntentClusterCount14d: 0,
    thirdPartyIntentCount30d: 0,
    websiteVisitCount14d: 0,
    webinarRegistrationCount30d: 0,
    formFillCount30d: 0,
    emailReplyCount30d: 0,
    meetingBookedCount30d: 0,
    meetingNoShowCount30d: 0,
    engagedContactCount30d: 0,
    productSignupCount30d: 0,
    teamInviteCount30d: 0,
    keyActivationCount30d: 0,
  };
}

function isWithinWindow(date: Date, floorDate: Date) {
  return date.getTime() >= floorDate.getTime();
}

function isTeamInviteSignal(signal: ScoringSignalFact) {
  if (signal.eventType !== SignalType.PRODUCT_USAGE_MILESTONE) {
    return false;
  }

  const milestone = getRawReferenceValue(signal, ["milestone", "milestone_name"]);
  return Boolean(milestone && /(invite|invited_teammate|invited teammate|team_invite)/.test(milestone));
}

function isKeyActivationSignal(signal: ScoringSignalFact) {
  if (signal.eventType !== SignalType.PRODUCT_USAGE_MILESTONE) {
    return false;
  }

  const milestone = getRawReferenceValue(signal, ["milestone", "milestone_name"]);
  return Boolean(
    milestone &&
      /(activated|activation|connected_crm|connected crm|key_feature|key feature)/.test(milestone),
  );
}

function buildSignalMetrics(signals: ScoringSignalFact[], now: Date): AccountSignalMetrics {
  const metrics = buildEmptyMetrics();
  const engagedContactIds = new Set<string>();
  const pricingWindow = subDays(now, 7);
  const intentWindow = subDays(now, 14);
  const thirtyDayWindow = subDays(now, 30);

  for (const signal of signals) {
    if (!metrics.lastSignalAt || signal.occurredAt > metrics.lastSignalAt) {
      metrics.lastSignalAt = signal.occurredAt;
    }

    if (signal.contactId && isWithinWindow(signal.occurredAt, thirtyDayWindow)) {
      if (
        signal.eventType === SignalType.FORM_FILL ||
        signal.eventType === SignalType.EMAIL_REPLY ||
        signal.eventType === SignalType.MEETING_BOOKED
      ) {
        engagedContactIds.add(signal.contactId);
      }
    }

    if (signal.eventType === SignalType.PRICING_PAGE_VISIT && isWithinWindow(signal.occurredAt, pricingWindow)) {
      metrics.pricingVisitCount7d += 1;
    }

    if (
      signal.eventType === SignalType.HIGH_INTENT_PAGE_CLUSTER_VISIT &&
      isWithinWindow(signal.occurredAt, intentWindow)
    ) {
      metrics.highIntentClusterCount14d += 1;
    }

    if (signal.eventType === SignalType.THIRD_PARTY_INTENT_EVENT && isWithinWindow(signal.occurredAt, thirtyDayWindow)) {
      metrics.thirdPartyIntentCount30d += 1;
    }

    if (signal.eventType === SignalType.WEBSITE_VISIT && isWithinWindow(signal.occurredAt, intentWindow)) {
      metrics.websiteVisitCount14d += 1;
    }

    if (signal.eventType === SignalType.WEBINAR_REGISTRATION && isWithinWindow(signal.occurredAt, thirtyDayWindow)) {
      metrics.webinarRegistrationCount30d += 1;
    }

    if (signal.eventType === SignalType.FORM_FILL && isWithinWindow(signal.occurredAt, thirtyDayWindow)) {
      metrics.formFillCount30d += 1;
    }

    if (signal.eventType === SignalType.EMAIL_REPLY && isWithinWindow(signal.occurredAt, thirtyDayWindow)) {
      metrics.emailReplyCount30d += 1;
    }

    if (signal.eventType === SignalType.MEETING_BOOKED && isWithinWindow(signal.occurredAt, thirtyDayWindow)) {
      metrics.meetingBookedCount30d += 1;
    }

    if (signal.eventType === SignalType.MEETING_NO_SHOW && isWithinWindow(signal.occurredAt, thirtyDayWindow)) {
      metrics.meetingNoShowCount30d += 1;
    }

    if (signal.eventType === SignalType.PRODUCT_SIGNUP && isWithinWindow(signal.occurredAt, thirtyDayWindow)) {
      metrics.productSignupCount30d += 1;
    }

    if (isTeamInviteSignal(signal) && isWithinWindow(signal.occurredAt, thirtyDayWindow)) {
      metrics.teamInviteCount30d += 1;
    }

    if (isKeyActivationSignal(signal) && isWithinWindow(signal.occurredAt, thirtyDayWindow)) {
      metrics.keyActivationCount30d += 1;
    }
  }

  metrics.engagedContactCount30d = engagedContactIds.size;

  return metrics;
}

export function buildAccountScoringInput(params: AccountInputParams): AccountScoringInput {
  return {
    segment: params.segment,
    accountTier: params.accountTier,
    employeeCount: params.employeeCount,
    annualRevenueBand: params.annualRevenueBand,
    hasNamedOwner: Boolean(params.namedOwnerId),
    manualPriorityBoost: params.manualPriorityBoost,
    signalMetrics: buildSignalMetrics(params.signals, params.now),
  };
}

export function buildLeadScoringInput(params: LeadInputParams): LeadScoringInput {
  const directSignals = params.signals.filter((signal) => {
    if (signal.leadId && signal.leadId === params.leadId) {
      return true;
    }

    return Boolean(params.contactId && signal.contactId === params.contactId);
  });
  const inheritedSignals = params.signals.filter((signal) => !directSignals.includes(signal));

  return {
    accountFitScore: params.accountFitScore,
    seniority: params.seniority,
    personaType: params.personaType,
    manualPriorityBoost: params.manualPriorityBoost,
    directSignalMetrics: buildSignalMetrics(directSignals, params.now),
    inheritedSignalMetrics: buildSignalMetrics(inheritedSignals, params.now),
  };
}
