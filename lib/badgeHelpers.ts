import type { RoutingDecisionType, RoutingReasonCategory } from "@/lib/contracts/routing";

type BadgeTone = "neutral" | "accent" | "positive" | "warning" | "danger";

// Signal status string → Badge tone
// Status values are human-readable labels from the backend (not raw enum values)
export function getSignalStatusTone(status: string): BadgeTone {
  if (status === "Matched") return "positive";
  if (status === "Unmatched") return "warning";
  if (status === "Error") return "danger";
  return "neutral"; // "Received", "Normalized", or any other state
}

// SignalReasonTone ("default" | "warning" | "danger") → Badge tone
export function getSignalReasonTone(
  tone: "default" | "warning" | "danger",
): BadgeTone {
  if (tone === "warning") return "warning";
  if (tone === "danger") return "danger";
  return "neutral";
}

export function getSegmentTone(segment: string): BadgeTone {
  switch (segment) {
    case "SMB":
      return "neutral";
    case "Mid Market":
      return "accent";
    case "Enterprise":
      return "warning";
    case "Strategic":
      return "positive";
    default:
      return "neutral";
  }
}

export function getLifecycleStageTone(stage: string): BadgeTone {
  switch (stage) {
    case "Prospect":
      return "neutral";
    case "Engaged":
      return "accent";
    case "Sales Ready":
      return "positive";
    case "Customer":
      return "warning";
    case "Nurture":
      return "danger";
    default:
      return "neutral";
  }
}

export function getStatusTone(status: string): BadgeTone {
  switch (status) {
    case "Hot":
      return "positive";
    case "Healthy":
      return "positive";
    case "Watch":
      return "warning";
    case "At Risk":
      return "danger";
    default:
      return "neutral";
  }
}

export function getTaskPriorityTone(priority: string): BadgeTone {
  switch (priority) {
    case "Urgent":
      return "danger";
    case "High":
      return "warning";
    case "Medium":
      return "accent";
    case "Low":
      return "neutral";
    default:
      return "neutral";
  }
}

export function getDecisionTypeTone(decisionType: RoutingDecisionType): BadgeTone {
  switch (decisionType) {
    case "named_account_owner":
      return "positive";
    case "existing_account_owner":
      return "positive";
    case "strategic_tier_override":
      return "accent";
    case "territory_segment_rule":
      return "accent";
    case "round_robin_pool":
      return "neutral";
    case "ops_review_queue":
      return "warning";
    default:
      return "neutral";
  }
}

export function getReasonCategoryTone(category: RoutingReasonCategory): BadgeTone {
  switch (category) {
    case "match":
      return "positive";
    case "capacity":
      return "accent";
    case "fallback":
      return "warning";
    case "sla":
      return "neutral";
    case "outcome":
      return "danger";
    default:
      return "neutral";
  }
}
