import { routeAccount, routeLead, simulateRouting, getRoutingDecisionById, getRoutingDecisionsForEntity } from "../lib/routing";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const beaconOpsDecisionsBefore = await getRoutingDecisionsForEntity("lead", "acc_beaconops_lead_01");
  invariant(beaconOpsDecisionsBefore.length === 1, "Expected a single seeded routing decision for the BeaconOps lead.");

  const reroutedBeaconOps = await routeLead("acc_beaconops_lead_01", {
    effectiveAt: beaconOpsDecisionsBefore[0]!.createdAtIso,
  });
  const beaconOpsDecisionsAfter = await getRoutingDecisionsForEntity("lead", "acc_beaconops_lead_01");

  invariant(reroutedBeaconOps !== null, "Expected routeLead to return the latest BeaconOps decision.");
  invariant(
    reroutedBeaconOps.id === beaconOpsDecisionsBefore[0]!.id,
    "Expected idempotent lead routing to return the existing BeaconOps decision.",
  );
  invariant(
    beaconOpsDecisionsAfter.length === beaconOpsDecisionsBefore.length,
    "Expected idempotent lead routing to avoid duplicate BeaconOps decisions.",
  );
  invariant(
    reroutedBeaconOps.explanation.capacity.fallbackTriggered,
    "Expected BeaconOps routing to preserve capacity fallback metadata.",
  );

  const brightHarborDecision = (await getRoutingDecisionsForEntity("lead", "acc_brightharbor_retail_lead_01"))[0];
  invariant(brightHarborDecision, "Expected a BrightHarbor routing decision.");
  invariant(
    brightHarborDecision.decisionType === "territory_segment_rule",
    "Expected BrightHarbor to route through the territory + segment rule.",
  );

  const cedarLoopDecision = (await getRoutingDecisionsForEntity("lead", "acc_cedar_loop_lead_01"))[0];
  invariant(cedarLoopDecision, "Expected a Cedar Loop routing decision.");
  invariant(
    cedarLoopDecision.decisionType === "round_robin_pool",
    "Expected Cedar Loop to route through the fallback round-robin pool.",
  );

  const ironPeakDecision = (await getRoutingDecisionsForEntity("lead", "acc_ironpeak_lead_01"))[0];
  invariant(ironPeakDecision, "Expected an Iron Peak routing decision.");
  invariant(
    ironPeakDecision.decisionType === "strategic_tier_override" &&
      ironPeakDecision.secondaryOwner?.id === "usr_sarah_kim",
    "Expected Iron Peak to route through the strategic AE + SDR pairing.",
  );

  const novachannelDecision = (await getRoutingDecisionsForEntity("lead", "acc_novachannel_lead_01"))[0];
  invariant(novachannelDecision, "Expected a NovaChannel routing decision.");
  invariant(
    novachannelDecision.decisionType === "ops_review_queue" &&
      novachannelDecision.assignedOwner === null &&
      novachannelDecision.assignedQueue === "ops-review",
    "Expected NovaChannel to route to ops review with no assigned owner.",
  );

  const accountDecision = await routeAccount("acc_signalnest", {
    effectiveAt: "2026-03-27T20:00:00.000Z",
  });
  invariant(accountDecision !== null, "Expected routeAccount to persist an account-level decision.");
  invariant(
    accountDecision.decisionType === "existing_account_owner" &&
      accountDecision.assignedOwner?.id === "usr_owen_price",
    "Expected SignalNest account routing to preserve Owen Price as the existing owner.",
  );

  const fetchedAccountDecision = await getRoutingDecisionById(accountDecision.id);
  invariant(fetchedAccountDecision !== null, "Expected account routing lookup by ID.");
  invariant(
    fetchedAccountDecision.id === accountDecision.id,
    "Expected account routing lookup to return the persisted decision.",
  );

  const accountRoutingHistory = await getRoutingDecisionsForEntity("account", "acc_signalnest");
  invariant(accountRoutingHistory.length === 1, "Expected one persisted account routing decision for SignalNest.");

  const simulation = await simulateRouting({
    accountDomain: "novachannelcommerce.com",
    geography: "APAC",
    segment: "MID_MARKET",
    accountTier: "TIER_2",
    leadSource: "Pricing page revisit",
    inboundType: "Inbound",
    temperature: "WARM",
    capacityScenario: "all_candidates_overloaded",
  });
  invariant(
    simulation.decisionType === "ops_review_queue",
    "Expected routing simulation to fall through to ops review when all candidates are overloaded.",
  );
  invariant(
    simulation.reasonCodes.includes("sent_to_ops_review"),
    "Expected routing simulation to expose sent_to_ops_review.",
  );

  console.log("Routing verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
