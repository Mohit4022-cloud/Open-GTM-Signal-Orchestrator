import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { AuditEventType } from "@prisma/client";

import { getAuditLogForEntity, getRecentAuditEvents } from "@/lib/audit/queries";
import { db } from "@/lib/db";

import { resetDatabase } from "./helpers/db";

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await resetDatabase();
});

test("getAuditLogForEntity formats stable display summaries for known audit payload keys", async () => {
  await db.auditLog.create({
    data: {
      id: "audit_format_test",
      eventType: AuditEventType.TASK_UPDATED,
      actorType: "user",
      actorId: null,
      actorName: "Workspace operator",
      action: "task_updated",
      entityType: "task",
      entityId: "task_format_test",
      accountId: "acc_meridian_freight",
      leadId: "acc_meridian_freight_lead_01",
      beforeState: {
        ownerName: "Amelia Ross",
        queue: "na-east-midmarket",
        priority: "HIGH",
        totalScore: 61,
        reasonCodes: ["warm_pricing_activity_requires_research"],
      },
      afterState: {
        ownerName: "Dante Kim",
        queue: "na-east-enterprise",
        priority: "URGENT",
        totalScore: 78,
        dueAt: "2026-03-30T18:00:00.000Z",
      },
      reasonCodesJson: ["sla_breach_requires_escalation", "fallback_after_capacity"],
      explanation: "Escalated the follow-up task after routing fell back on capacity and the SLA risk increased.",
      createdAt: new Date("2026-03-30T18:05:00.000Z"),
    },
  });

  const [entry] = await getAuditLogForEntity("task", "task_format_test", { limit: 5 });

  assert.ok(entry);
  assert.equal(entry.id, "audit_format_test");
  assert.equal(entry.actor.summary, "User · Workspace operator");
  assert.equal(entry.action, "Task Updated");
  assert.equal(entry.entity.summary, "Task task_format_test");
  assert.equal(
    entry.before.summary,
    "Owner Name: Amelia Ross | Queue: na-east-midmarket | Priority: High | Total Score: 61",
  );
  assert.equal(
    entry.after.summary,
    "Owner Name: Dante Kim | Queue: na-east-enterprise | Priority: Urgent | Total Score: 78",
  );
  assert.deepEqual(entry.before.changedKeys, [
    "ownerName",
    "queue",
    "priority",
    "totalScore",
    "reasonCodes",
  ]);
  assert.equal(entry.reason.primaryCode, "sla_breach_requires_escalation");
  assert.equal(entry.reason.summary, "Sla Breach Requires Escalation +1 more");
  assert.equal(entry.explanation.length > 40, true);
  assert.equal(entry.timestampIso, "2026-03-30T18:05:00.000Z");
  assert.equal(entry.timestampLabel.length > 0, true);
});

test("getRecentAuditEvents returns newest-first canonical audit entries", async () => {
  await db.auditLog.createMany({
    data: [
      {
        id: "audit_recent_oldest",
        eventType: AuditEventType.RULE_CONFIG_CHANGED,
        actorType: "system",
        actorId: null,
        actorName: "Seed Pipeline",
        action: "rule_config_changed",
        entityType: "rule_config",
        entityId: "rule_scoring_v1",
        reasonCodesJson: ["activate_scoring_v1_for_demo_seed"],
        explanation: "Activated the scoring/v1 rule set for deterministic GTM demo scoring.",
        createdAt: new Date("2030-03-25T03:00:00.000Z"),
      },
      {
        id: "audit_recent_newest",
        eventType: AuditEventType.USER_OVERRIDE,
        actorType: "user",
        actorId: null,
        actorName: "Priya Singh",
        action: "user_override",
        entityType: "account",
        entityId: "acc_signalnest",
        accountId: "acc_signalnest",
        reasonCodesJson: ["manual_priority_override_requested"],
        explanation: "Workspace operator changed account priority boost from 0 to 3.",
        createdAt: new Date("2030-03-26T15:20:00.000Z"),
      },
    ],
  });

  const entries = await getRecentAuditEvents(2);

  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.id, "audit_recent_newest");
  assert.equal(entries[1]?.id, "audit_recent_oldest");
  assert.equal(entries[0]?.actor.type, "user");
  assert.equal(entries[0]?.reason.primaryCode, "manual_priority_override_requested");
});
