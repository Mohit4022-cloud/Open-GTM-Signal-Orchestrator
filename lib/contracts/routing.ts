export const routingEntityTypeValues = ["lead", "account"] as const;

export type RoutingEntityType = (typeof routingEntityTypeValues)[number];

export const routingDecisionTypeValues = [
  "named_account_owner",
  "existing_account_owner",
  "strategic_tier_override",
  "territory_segment_rule",
  "round_robin_pool",
  "ops_review_queue",
] as const;

export type RoutingDecisionType = (typeof routingDecisionTypeValues)[number];

export const routingReasonCodeValues = [
  "account_is_named",
  "existing_owner_preserved",
  "strategic_tier_override",
  "strategic_pair_assigned",
  "territory_segment_match",
  "territory_rule_no_match",
  "round_robin_selected",
  "owner_has_capacity",
  "owner_over_capacity",
  "fallback_after_capacity",
  "no_eligible_owner_found",
  "sent_to_ops_review",
  "sla_hot_inbound_15m",
  "sla_warm_inbound_120m",
  "sla_product_qualified_240m",
  "sla_general_form_fill_1440m",
] as const;

export type RoutingReasonCode = (typeof routingReasonCodeValues)[number];

export const routingSimulationCapacityScenarioValues = [
  "current",
  "named_owner_overloaded",
  "existing_owner_overloaded",
  "territory_pool_overloaded",
  "all_candidates_overloaded",
] as const;

export type RoutingSimulationCapacityScenario =
  (typeof routingSimulationCapacityScenarioValues)[number];

export type RoutingCapacityBlockingCheck =
  | "open_hot_leads"
  | "daily_inbound_assignments"
  | "open_task_count";

export type RoutingOwnerSummaryContract = {
  id: string;
  name: string;
  role: string;
  team: string;
  geography: string;
};

export type RoutingCapacitySnapshotContract = {
  ownerId: string;
  ownerName: string;
  role: string;
  team: string;
  openHotLeads: number;
  maxOpenHotLeads: number;
  dailyInboundAssignments: number;
  maxDailyInboundAssignments: number;
  openTaskCount: number;
  maxOpenTasks: number;
  hasCapacity: boolean;
  blockingChecks: RoutingCapacityBlockingCheck[];
};

export type RoutingEvaluationStepContract = {
  precedence: number;
  policyKey: string;
  decisionType: RoutingDecisionType;
  matched: boolean;
  selected: boolean;
  skippedReason: string | null;
  reasonCodes: RoutingReasonCode[];
  candidateOwnerIds: string[];
  capacityChecks: RoutingCapacitySnapshotContract[];
};

export type RoutingExplanationDecision =
  | "assigned_to_owner"
  | "sent_to_ops_review";

export type RoutingAppliedPolicyContract = {
  precedence: number;
  policyKey: string;
  decisionType: RoutingDecisionType;
};

export type RoutingEntityContextContract = {
  entityType: RoutingEntityType;
  accountDomain: string | null;
  geography: string | null;
  segment: string | null;
  accountTier: string | null;
  namedAccount: boolean;
  hasExistingOwner: boolean;
  leadSource: string | null;
  inboundType: string | null;
  sdrPod: string | null;
  temperature: string | null;
};

export type RoutingAssignmentContract = {
  owner: RoutingOwnerSummaryContract | null;
  secondaryOwner: RoutingOwnerSummaryContract | null;
  team: string | null;
  queue: string;
  escalationPolicyKey: string | null;
};

export type RoutingSlaContract = {
  targetMinutes: number | null;
  dueAtIso: string | null;
  reasonCodes: RoutingReasonCode[];
};

export type RoutingExplanationContract = {
  decision: RoutingExplanationDecision;
  appliedPolicy: RoutingAppliedPolicyContract;
  evaluatedPolicies: RoutingEvaluationStepContract[];
  entityContext: RoutingEntityContextContract;
  assignment: RoutingAssignmentContract;
  capacity: {
    checkedOwners: RoutingCapacitySnapshotContract[];
    fallbackTriggered: boolean;
  };
  sla: RoutingSlaContract;
  reasonCodes: RoutingReasonCode[];
};

export type RoutingDecisionContract = {
  id: string;
  entityType: RoutingEntityType;
  entityId: string;
  accountId: string | null;
  leadId: string | null;
  policyVersion: string;
  decisionType: RoutingDecisionType;
  assignedOwner: RoutingOwnerSummaryContract | null;
  secondaryOwner: RoutingOwnerSummaryContract | null;
  assignedTeam: string | null;
  assignedQueue: string;
  slaTargetMinutes: number | null;
  slaDueAtIso: string | null;
  escalationPolicyKey: string | null;
  reasonCodes: RoutingReasonCode[];
  explanation: RoutingExplanationContract;
  triggerSignalId: string | null;
  createdAtIso: string;
};

export type RoutingSimulationInputContract = {
  accountDomain?: string | null;
  leadSource?: string | null;
  leadSourceType?: "inbound" | "outbound" | "signal" | "unknown";
  segment?: string | null;
  geography?: string | null;
  accountTier?: string | null;
  namedAccount?: boolean;
  namedOwnerId?: string | null;
  existingOwnerId?: string | null;
  inboundType?: string | null;
  sdrPod?: string | null;
  temperature?: string | null;
  triggerSignalType?: string | null;
  capacityScenario?: RoutingSimulationCapacityScenario;
};

export type RoutingSimulationResultContract = {
  policyVersion: string;
  decisionType: RoutingDecisionType;
  simulatedOwner: RoutingOwnerSummaryContract | null;
  simulatedSecondaryOwner: RoutingOwnerSummaryContract | null;
  simulatedTeam: string | null;
  simulatedQueue: string;
  reasonCodes: RoutingReasonCode[];
  slaTargetMinutes: number | null;
  slaDueAtIso: string | null;
  explanation: RoutingExplanationContract;
};

export type PublicRoutingSimulationResponseContract =
  RoutingSimulationResultContract;

export type PublicRoutingApiErrorCode =
  | "ROUTING_SIMULATION_VALIDATION_ERROR"
  | "ROUTING_SIMULATION_INTERNAL_ERROR";

export type PublicRoutingApiErrorResponseContract = {
  code: PublicRoutingApiErrorCode;
  message: string;
  error: string | null;
};
