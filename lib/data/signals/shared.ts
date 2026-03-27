import type { SignalCategory, SignalStrength, SignalType } from "@prisma/client";
import { createHash } from "node:crypto";

import type {
  IngestibleSignalEventType,
  JsonRecord,
  SignalRawReferenceContract,
} from "@/lib/contracts/signals";

type SignalMetadata = {
  eventCategory: SignalCategory;
  intentStrength: SignalStrength;
  engagementStrength: SignalStrength;
  summary: (payload: JsonRecord) => string;
  rawReference: (payload: JsonRecord) => SignalRawReferenceContract;
};

function getStringValue(payload: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }

  return null;
}

function buildReference(payload: JsonRecord, keys: string[]) {
  return keys.reduce<SignalRawReferenceContract>((reference, key) => {
    const value = getStringValue(payload, [key]);
    if (value) {
      reference[key] = value;
    }
    return reference;
  }, {});
}

export const signalTypeInputMap: Record<IngestibleSignalEventType, SignalType> = {
  website_visit: "WEBSITE_VISIT",
  pricing_page_visit: "PRICING_PAGE_VISIT",
  high_intent_page_cluster_visit: "HIGH_INTENT_PAGE_CLUSTER_VISIT",
  form_fill: "FORM_FILL",
  webinar_registration: "WEBINAR_REGISTRATION",
  product_signup: "PRODUCT_SIGNUP",
  product_usage_milestone: "PRODUCT_USAGE_MILESTONE",
  email_reply: "EMAIL_REPLY",
  meeting_booked: "MEETING_BOOKED",
  meeting_no_show: "MEETING_NO_SHOW",
  third_party_intent_event: "THIRD_PARTY_INTENT_EVENT",
  manual_sales_note: "MANUAL_SALES_NOTE",
  account_status_update: "ACCOUNT_STATUS_UPDATE",
};

export const signalTypeMetadata: Record<SignalType, SignalMetadata> = {
  WEBSITE_VISIT: {
    eventCategory: "WEB_ACTIVITY",
    intentStrength: "LOW",
    engagementStrength: "LOW",
    summary: (payload) => {
      const page = getStringValue(payload, ["page", "url_path"]) ?? "unknown page";
      const visits = getStringValue(payload, ["visit_count"]);
      return visits ? `Visited ${page} (${visits} visits).` : `Visited ${page}.`;
    },
    rawReference: (payload) => buildReference(payload, ["page", "session_id", "visit_count"]),
  },
  PRICING_PAGE_VISIT: {
    eventCategory: "WEB_ACTIVITY",
    intentStrength: "HIGH",
    engagementStrength: "MEDIUM",
    summary: (payload) => {
      const page = getStringValue(payload, ["page"]) ?? "/pricing";
      const visits = getStringValue(payload, ["visit_count"]);
      return visits ? `Viewed pricing page ${page} (${visits} visits).` : `Viewed pricing page ${page}.`;
    },
    rawReference: (payload) => buildReference(payload, ["page", "session_id", "visit_count"]),
  },
  HIGH_INTENT_PAGE_CLUSTER_VISIT: {
    eventCategory: "WEB_ACTIVITY",
    intentStrength: "HIGH",
    engagementStrength: "MEDIUM",
    summary: (payload) => {
      const cluster = getStringValue(payload, ["page_cluster", "cluster"]) ?? "high-intent cluster";
      return `Visited ${cluster}.`;
    },
    rawReference: (payload) => buildReference(payload, ["page_cluster", "cluster", "session_id"]),
  },
  FORM_FILL: {
    eventCategory: "CONVERSION",
    intentStrength: "HIGH",
    engagementStrength: "HIGH",
    summary: (payload) => {
      const form = getStringValue(payload, ["form_id", "form_name"]) ?? "unknown form";
      return `Submitted ${form}.`;
    },
    rawReference: (payload) => buildReference(payload, ["form_id", "form_name", "submission_id", "campaign"]),
  },
  WEBINAR_REGISTRATION: {
    eventCategory: "CONVERSION",
    intentStrength: "MEDIUM",
    engagementStrength: "MEDIUM",
    summary: (payload) => {
      const webinar = getStringValue(payload, ["webinar_name", "webinar", "webinar_id"]) ?? "webinar";
      return `Registered for ${webinar}.`;
    },
    rawReference: (payload) =>
      buildReference(payload, ["webinar_id", "webinar_name", "registration_id", "campaign"]),
  },
  PRODUCT_SIGNUP: {
    eventCategory: "PRODUCT",
    intentStrength: "HIGH",
    engagementStrength: "HIGH",
    summary: (payload) => {
      const plan = getStringValue(payload, ["plan", "workspace_plan"]) ?? "workspace";
      return `Started product signup for ${plan}.`;
    },
    rawReference: (payload) => buildReference(payload, ["signup_id", "workspace_id", "plan", "workspace_plan"]),
  },
  PRODUCT_USAGE_MILESTONE: {
    eventCategory: "PRODUCT",
    intentStrength: "MEDIUM",
    engagementStrength: "HIGH",
    summary: (payload) => {
      const milestone = getStringValue(payload, ["milestone", "milestone_name"]) ?? "usage milestone";
      return `Reached ${milestone}.`;
    },
    rawReference: (payload) => buildReference(payload, ["workspace_id", "milestone", "milestone_name", "user_id"]),
  },
  EMAIL_REPLY: {
    eventCategory: "SALES_ENGAGEMENT",
    intentStrength: "HIGH",
    engagementStrength: "HIGH",
    summary: (payload) => {
      const subject = getStringValue(payload, ["thread_topic", "subject"]) ?? "sales outreach";
      return `Replied to ${subject}.`;
    },
    rawReference: (payload) => buildReference(payload, ["thread_id", "message_id", "thread_topic", "subject"]),
  },
  MEETING_BOOKED: {
    eventCategory: "SALES_ACTIVITY",
    intentStrength: "HIGH",
    engagementStrength: "HIGH",
    summary: (payload) => {
      const meetingType = getStringValue(payload, ["meeting_type", "meetingType"]) ?? "meeting";
      return `Booked ${meetingType}.`;
    },
    rawReference: (payload) => buildReference(payload, ["meeting_id", "calendar_event_id", "meeting_type"]),
  },
  MEETING_NO_SHOW: {
    eventCategory: "SALES_ACTIVITY",
    intentStrength: "MEDIUM",
    engagementStrength: "LOW",
    summary: (payload) => {
      const meetingType = getStringValue(payload, ["meeting_type", "meetingType"]) ?? "meeting";
      return `No-show for ${meetingType}.`;
    },
    rawReference: (payload) => buildReference(payload, ["meeting_id", "calendar_event_id", "meeting_type"]),
  },
  THIRD_PARTY_INTENT_EVENT: {
    eventCategory: "INTENT",
    intentStrength: "HIGH",
    engagementStrength: "NONE",
    summary: (payload) => {
      const topic = getStringValue(payload, ["topic", "intent_topic"]) ?? "intent topic";
      return `Third-party intent increased for ${topic}.`;
    },
    rawReference: (payload) => buildReference(payload, ["provider", "topic", "intent_id"]),
  },
  MANUAL_SALES_NOTE: {
    eventCategory: "MANUAL",
    intentStrength: "MEDIUM",
    engagementStrength: "LOW",
    summary: (payload) => {
      const subject = getStringValue(payload, ["note_subject", "subject"]) ?? "sales note";
      return `Captured ${subject}.`;
    },
    rawReference: (payload) => buildReference(payload, ["note_id", "author_id", "note_subject", "subject"]),
  },
  ACCOUNT_STATUS_UPDATE: {
    eventCategory: "ACCOUNT_CHANGE",
    intentStrength: "MEDIUM",
    engagementStrength: "NONE",
    summary: (payload) => {
      const nextStatus = getStringValue(payload, ["new_status", "status"]) ?? "updated status";
      return `Account status changed to ${nextStatus}.`;
    },
    rawReference: (payload) => buildReference(payload, ["status_change_id", "previous_status", "new_status"]),
  },
};

export function normalizeSourceSystem(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeAccountDomain(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
  return normalized.length > 0 ? normalized.replace(/\/.*$/, "") : null;
}

export function normalizeContactEmail(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

export function hashStableValue(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}
