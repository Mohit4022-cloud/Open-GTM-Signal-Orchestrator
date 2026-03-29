import assert from "node:assert/strict";
import { test } from "node:test";

import { actionReasonCodeValues } from "@/lib/contracts/actions";
import { buildActionReasonDetails } from "@/lib/actions/reason-codes";
import { buildRoutingReasonDetails, getRoutingReasonMetadata } from "@/lib/routing/reason-codes";
import { getScoreReasonMetadata, scoreReasonCodeValues } from "@/lib/scoring/reason-codes";

test("scoring reason metadata stays canonical, ordered, and display-ready", () => {
  const selectedCodes = [
    "intent_pricing_page_cluster",
    "product_usage_key_activation",
    "manual_priority_boost",
  ] as const;
  const canonicalOrder = [...selectedCodes].sort(
    (left, right) => scoreReasonCodeValues.indexOf(left) - scoreReasonCodeValues.indexOf(right),
  );

  assert.deepEqual(selectedCodes, canonicalOrder);

  for (const code of selectedCodes) {
    const metadata = getScoreReasonMetadata(code);

    assert.ok(metadata.component.length > 0);
    assert.ok(metadata.label.length > 0);
    assert.ok(metadata.description.length > 0);
  }
});

test("routing reason details stay concise by default and verbose when diagnostics are requested", () => {
  const reasonCodes = [
    "existing_owner_preserved",
    "fallback_after_capacity",
    "owner_has_capacity",
    "no_eligible_owner_found",
    "sla_hot_inbound_15m",
  ] as const;
  const concise = buildRoutingReasonDetails([...reasonCodes]);
  const verbose = buildRoutingReasonDetails([...reasonCodes], { includeNoisy: true });

  assert.deepEqual(
    concise.map((detail) => detail.code),
    ["existing_owner_preserved", "fallback_after_capacity", "sla_hot_inbound_15m"],
  );
  assert.deepEqual(
    verbose.map((detail) => detail.code),
    reasonCodes,
  );
  assert.ok(getRoutingReasonMetadata("sent_to_ops_review").label.length > 0);
  assert.ok(getRoutingReasonMetadata("sent_to_ops_review").description.length > 0);
});

test("action reason details remain human-readable and deterministic for urgent inbound follow-up", () => {
  const reasonCodes = [
    "urgent_inbound_requires_immediate_call",
    "follow_up_email_required_after_demo_request",
    "strategic_account_requires_ae_handoff",
  ] as const;
  const details = buildActionReasonDetails([...reasonCodes]);

  assert.deepEqual(
    details.map((detail) => detail.code),
    reasonCodes,
  );
  assert.equal(
    details.every(
      (detail) =>
        actionReasonCodeValues.includes(detail.code) &&
        detail.label.length > 0 &&
        detail.description.length > 0,
    ),
    true,
  );
  assert.equal(details[0]?.category, "sla");
  assert.equal(details[1]?.category, "follow_up");
  assert.equal(details[2]?.category, "routing");
});
