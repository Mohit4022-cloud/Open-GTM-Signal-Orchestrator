import type {
  AuditEventType,
  SignalCategory,
  SignalStatus,
  SignalStrength,
  SignalType,
} from "@prisma/client";

export const ingestibleSignalEventTypes = [
  "website_visit",
  "pricing_page_visit",
  "high_intent_page_cluster_visit",
  "form_fill",
  "webinar_registration",
  "product_signup",
  "product_usage_milestone",
  "email_reply",
  "meeting_booked",
  "meeting_no_show",
  "third_party_intent_event",
  "manual_sales_note",
  "account_status_update",
] as const;

export const identityResolutionCodeValues = [
  "account_domain_exact_match",
  "contact_email_exact_match",
  "contact_implies_account",
  "no_domain_provided",
  "no_email_provided",
  "no_confident_match",
  "conflicting_match_candidates",
] as const;

export type IngestibleSignalEventType = (typeof ingestibleSignalEventTypes)[number];
export type IdentityResolutionCode = (typeof identityResolutionCodeValues)[number];
export type JsonRecord = Record<string, unknown>;
export type SignalRawReferenceContract = Record<string, string>;

export type SignalNormalizedSummaryContract = {
  accountDomain: string | null;
  contactEmail: string | null;
  eventCategory: SignalCategory;
  intentStrength: SignalStrength;
  engagementStrength: SignalStrength;
  payloadSummary: string;
  rawReference: SignalRawReferenceContract;
};

export type CanonicalSignalEventContract = SignalNormalizedSummaryContract & {
  sourceSystem: string;
  eventType: SignalType;
  occurredAtIso: string;
};

export type IngestSignalInput = {
  source_system: string;
  event_type: IngestibleSignalEventType;
  account_domain?: string | null;
  contact_email?: string | null;
  occurred_at: string;
  received_at?: string | null;
  payload: JsonRecord;
};

export type MatchedEntityContract = {
  id: string;
  name: string;
};

export type MatchedEntitiesContract = {
  account: MatchedEntityContract | null;
  contact: MatchedEntityContract | null;
  lead: MatchedEntityContract | null;
};

export type DedupeResultContract = {
  key: string;
  duplicate: boolean;
  existingSignalId: string | null;
};

export type IngestSignalOutcome = "matched" | "unmatched" | "duplicate";

export type IngestSignalResult = {
  signalId: string;
  created: boolean;
  status: SignalStatus;
  outcome: IngestSignalOutcome;
  matchedEntities: MatchedEntitiesContract;
  reasonCodes: IdentityResolutionCode[];
  dedupe: DedupeResultContract;
  normalizedEvent: CanonicalSignalEventContract;
  errorMessage: string | null;
};

export type UploadSignalsCsvParsedRow = Record<string, string>;

export type UploadSignalsCsvInput = {
  file?: File;
  parsedRows?: UploadSignalsCsvParsedRow[];
};

export type UploadSignalsCsvRowResult = {
  rowNumber: number;
  signalId: string | null;
  status: SignalStatus | "VALIDATION_ERROR";
  outcome: IngestSignalOutcome | "error";
  reasonCodes: IdentityResolutionCode[];
  errorMessage: string | null;
};

export type UploadSignalsCsvResult = {
  processed: number;
  inserted: number;
  duplicates: number;
  unmatched: number;
  errors: number;
  rows: UploadSignalsCsvRowResult[];
};

export type RecentSignalFeedItemContract = {
  signalId: string;
  sourceSystem: string;
  eventType: SignalType;
  occurredAtIso: string;
  receivedAtIso: string;
  status: SignalStatus;
  dedupeKey: string;
  matchedEntities: MatchedEntitiesContract;
  reasonCodes: IdentityResolutionCode[];
  normalizedSummary: SignalNormalizedSummaryContract;
};

export type TimelineAssociatedContactContract = {
  id: string;
  fullName: string;
  email: string;
};

export type AccountTimelineItemContract = {
  signalId: string;
  eventType: SignalType;
  sourceSystem: string;
  occurredAtIso: string;
  matchStatus: SignalStatus;
  displayTitle: string;
  displaySubtitle: string;
  normalizedSummary: SignalNormalizedSummaryContract;
  associatedContact: TimelineAssociatedContactContract | null;
};

export type GetAccountTimelineOptions = {
  limit?: number;
};

export type GetUnmatchedSignalsFilters = {
  limit?: number;
  sourceSystem?: string;
  eventType?: SignalType;
  reasonCode?: IdentityResolutionCode;
};

export type UnmatchedSignalQueueItemContract = {
  signalId: string;
  sourceSystem: string;
  eventType: SignalType;
  occurredAtIso: string;
  accountDomainCandidate: string | null;
  contactEmailCandidate: string | null;
  reasonCodes: IdentityResolutionCode[];
  normalizedSummary: SignalNormalizedSummaryContract;
  createdAtIso: string;
  receivedAtIso: string;
};

export type SignalAuditEntryContract = {
  id: string;
  eventType: AuditEventType;
  explanation: string;
  actorType: string;
  actorName: string;
  createdAtIso: string;
};

export type SignalDetailContract = {
  signalId: string;
  sourceSystem: string;
  eventType: SignalType;
  status: SignalStatus;
  dedupeKey: string;
  accountDomain: string | null;
  contactEmail: string | null;
  occurredAtIso: string;
  receivedAtIso: string;
  createdAtIso: string;
  errorMessage: string | null;
  reasonCodes: IdentityResolutionCode[];
  matchedEntities: MatchedEntitiesContract;
  rawPayload: JsonRecord;
  normalizedPayload: CanonicalSignalEventContract;
  normalizedSummary: SignalNormalizedSummaryContract;
  auditTrail: SignalAuditEntryContract[];
};
