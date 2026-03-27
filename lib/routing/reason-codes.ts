import type { RoutingReasonCode } from "@/lib/contracts/routing";
import { routingReasonCodeValues } from "@/lib/contracts/routing";

export const routingReasonCodeSet = new Set<RoutingReasonCode>(
  routingReasonCodeValues,
);

type RoutingReasonMetadata = {
  label: string;
  description: string;
};

const metadataByReasonCode: Record<RoutingReasonCode, RoutingReasonMetadata> = {
  account_is_named: {
    label: "Named account",
    description: "The account has a named owner and the named-owner rule matched first.",
  },
  existing_owner_preserved: {
    label: "Existing owner preserved",
    description: "The account already has an assigned owner and continuity was preserved.",
  },
  strategic_tier_override: {
    label: "Strategic override",
    description: "A strategic-tier routing override took precedence over standard territory rules.",
  },
  strategic_pair_assigned: {
    label: "Strategic pair assigned",
    description: "A paired AE and SDR assignment was selected for strategic coverage.",
  },
  territory_segment_match: {
    label: "Territory and segment match",
    description: "The routing policy matched the account geography and segment.",
  },
  territory_rule_no_match: {
    label: "No territory rule match",
    description: "No territory and segment policy matched the routing context.",
  },
  round_robin_selected: {
    label: "Round-robin selected",
    description: "The least-recently-assigned eligible pool member was selected.",
  },
  owner_has_capacity: {
    label: "Owner has capacity",
    description: "The evaluated owner is below all configured routing capacity thresholds.",
  },
  owner_over_capacity: {
    label: "Owner over capacity",
    description: "The evaluated owner exceeded one or more routing capacity thresholds.",
  },
  fallback_after_capacity: {
    label: "Fallback after capacity",
    description: "Routing advanced to the next rule because a higher-precedence owner or pool was overloaded.",
  },
  no_eligible_owner_found: {
    label: "No eligible owner",
    description: "No owner with remaining capacity was available for the evaluated rule.",
  },
  sent_to_ops_review: {
    label: "Sent to ops review",
    description: "The routing engine sent the entity to the explicit ops review queue.",
  },
  sla_hot_inbound_15m: {
    label: "15 minute hot inbound SLA",
    description: "Hot inbound work receives the fastest response target.",
  },
  sla_warm_inbound_120m: {
    label: "2 hour warm inbound SLA",
    description: "Warm inbound work receives a two-hour response target.",
  },
  sla_product_qualified_240m: {
    label: "4 hour product-qualified SLA",
    description: "Product-qualified work receives a four-hour response target.",
  },
  sla_general_form_fill_1440m: {
    label: "24 hour form fill SLA",
    description: "General form-fill work receives a next-day response target.",
  },
};

export function getRoutingReasonMetadata(reasonCode: RoutingReasonCode) {
  return metadataByReasonCode[reasonCode];
}

export function parseRoutingReasonCodes(value: unknown): RoutingReasonCode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is RoutingReasonCode =>
      typeof item === "string" && routingReasonCodeSet.has(item as RoutingReasonCode),
  );
}
