-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "geography" TEXT NOT NULL,
    "employeeCount" INTEGER NOT NULL,
    "annualRevenueBand" TEXT NOT NULL,
    "namedOwnerId" TEXT,
    "ownerId" TEXT,
    "accountTier" TEXT NOT NULL,
    "lifecycleStage" TEXT NOT NULL,
    "fitScore" INTEGER NOT NULL,
    "intentScore" INTEGER NOT NULL DEFAULT 0,
    "engagementScore" INTEGER NOT NULL DEFAULT 0,
    "recencyScore" INTEGER NOT NULL DEFAULT 0,
    "productUsageScore" INTEGER NOT NULL DEFAULT 0,
    "manualPriorityScore" INTEGER NOT NULL DEFAULT 0,
    "manualPriorityBoost" INTEGER NOT NULL DEFAULT 0,
    "manualPriorityNote" TEXT,
    "manualPriorityUpdatedAt" DATETIME,
    "overallScore" INTEGER NOT NULL,
    "temperature" TEXT NOT NULL DEFAULT 'COLD',
    "status" TEXT NOT NULL,
    "scoreBreakdownJson" JSONB NOT NULL DEFAULT '{}',
    "scoreReasonCodesJson" JSONB NOT NULL DEFAULT '[]',
    "scoreExplanationJson" JSONB NOT NULL DEFAULT '{}',
    "scoreLastComputedAt" DATETIME,
    "scoringVersion" TEXT NOT NULL DEFAULT 'scoring/v1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_namedOwnerId_fkey" FOREIGN KEY ("namedOwnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Account_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("accountTier", "annualRevenueBand", "createdAt", "domain", "employeeCount", "engagementScore", "fitScore", "geography", "id", "industry", "intentScore", "lifecycleStage", "manualPriorityBoost", "manualPriorityNote", "manualPriorityScore", "manualPriorityUpdatedAt", "name", "namedOwnerId", "ownerId", "overallScore", "productUsageScore", "recencyScore", "scoreBreakdownJson", "scoreExplanationJson", "scoreLastComputedAt", "scoreReasonCodesJson", "scoringVersion", "segment", "status", "temperature", "updatedAt") SELECT "accountTier", "annualRevenueBand", "createdAt", "domain", "employeeCount", "engagementScore", "fitScore", "geography", "id", "industry", "intentScore", "lifecycleStage", "manualPriorityBoost", "manualPriorityNote", "manualPriorityScore", "manualPriorityUpdatedAt", "name", "namedOwnerId", "namedOwnerId", "overallScore", "productUsageScore", "recencyScore", "scoreBreakdownJson", "scoreExplanationJson", "scoreLastComputedAt", "scoreReasonCodesJson", "scoringVersion", "segment", "status", "temperature", "updatedAt" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE UNIQUE INDEX "Account_domain_key" ON "Account"("domain");
CREATE INDEX "Account_segment_geography_idx" ON "Account"("segment", "geography");
CREATE INDEX "Account_overallScore_idx" ON "Account"("overallScore");
CREATE INDEX "Account_temperature_overallScore_idx" ON "Account"("temperature", "overallScore");
CREATE INDEX "Account_namedOwnerId_idx" ON "Account"("namedOwnerId");
CREATE INDEX "Account_ownerId_idx" ON "Account"("ownerId");
CREATE TABLE "new_RoutingDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "leadId" TEXT,
    "accountId" TEXT,
    "policyVersion" TEXT NOT NULL,
    "decisionType" TEXT NOT NULL,
    "assignedOwnerId" TEXT,
    "secondaryOwnerId" TEXT,
    "assignedTeam" TEXT,
    "assignedQueue" TEXT NOT NULL,
    "reasonCodesJson" JSONB NOT NULL DEFAULT '[]',
    "explanationJson" JSONB NOT NULL DEFAULT '{}',
    "slaTargetMinutes" INTEGER,
    "slaDueAt" DATETIME,
    "escalationPolicyKey" TEXT,
    "triggerSignalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoutingDecision_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RoutingDecision_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RoutingDecision_assignedOwnerId_fkey" FOREIGN KEY ("assignedOwnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RoutingDecision_secondaryOwnerId_fkey" FOREIGN KEY ("secondaryOwnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RoutingDecision_triggerSignalId_fkey" FOREIGN KEY ("triggerSignalId") REFERENCES "SignalEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RoutingDecision" (
    "id",
    "entityType",
    "entityId",
    "leadId",
    "accountId",
    "policyVersion",
    "decisionType",
    "assignedOwnerId",
    "secondaryOwnerId",
    "assignedTeam",
    "assignedQueue",
    "reasonCodesJson",
    "explanationJson",
    "slaTargetMinutes",
    "slaDueAt",
    "escalationPolicyKey",
    "triggerSignalId",
    "createdAt"
)
SELECT
    "id",
    CASE
        WHEN "leadId" IS NOT NULL THEN 'LEAD'
        ELSE 'ACCOUNT'
    END,
    COALESCE("leadId", "accountId"),
    "leadId",
    "accountId",
    "policyVersion",
    CASE "decisionType"
        WHEN 'NAMED_ACCOUNT' THEN 'NAMED_ACCOUNT_OWNER'
        WHEN 'TERRITORY_SEGMENT' THEN 'TERRITORY_SEGMENT_RULE'
        WHEN 'ROUND_ROBIN' THEN 'ROUND_ROBIN_POOL'
        WHEN 'STRATEGIC_ESCALATION' THEN 'STRATEGIC_TIER_OVERRIDE'
        ELSE 'OPS_REVIEW_QUEUE'
    END,
    "assignedOwnerId",
    NULL,
    "assignedTeam",
    "assignedQueue",
    CASE "decisionType"
        WHEN 'NAMED_ACCOUNT' THEN '["account_is_named"]'
        WHEN 'TERRITORY_SEGMENT' THEN '["territory_segment_match"]'
        WHEN 'ROUND_ROBIN' THEN '["round_robin_selected"]'
        WHEN 'STRATEGIC_ESCALATION' THEN '["strategic_tier_override"]'
        ELSE '["sent_to_ops_review"]'
    END,
    json_object(
        'decision', lower(CASE "decisionType"
            WHEN 'OPS_REVIEW' THEN 'sent_to_ops_review'
            ELSE 'assigned_to_owner'
        END),
        'appliedPolicy', lower(CASE "decisionType"
            WHEN 'NAMED_ACCOUNT' THEN 'named_account_owner'
            WHEN 'TERRITORY_SEGMENT' THEN 'territory_segment_rule'
            WHEN 'ROUND_ROBIN' THEN 'round_robin_pool'
            WHEN 'STRATEGIC_ESCALATION' THEN 'strategic_tier_override'
            ELSE 'ops_review_queue'
        END),
        'evaluatedPolicies', json_array(),
        'entityContext', json_object(
            'entityType', lower(CASE
                WHEN "leadId" IS NOT NULL THEN 'lead'
                ELSE 'account'
            END)
        ),
        'assignment', json_object(
            'team', "assignedTeam",
            'queue', "assignedQueue",
            'escalationPolicyKey', NULL
        ),
        'capacity', json_object('checkedOwners', json_array()),
        'sla', json_object('targetMinutes', NULL, 'dueAtIso', NULL, 'reasonCodes', json_array()),
        'reasonCodes', CASE "decisionType"
            WHEN 'NAMED_ACCOUNT' THEN json('["account_is_named"]')
            WHEN 'TERRITORY_SEGMENT' THEN json('["territory_segment_match"]')
            WHEN 'ROUND_ROBIN' THEN json('["round_robin_selected"]')
            WHEN 'STRATEGIC_ESCALATION' THEN json('["strategic_tier_override"]')
            ELSE json('["sent_to_ops_review"]')
        END
    ),
    NULL,
    NULL,
    NULL,
    NULL,
    "createdAt"
FROM "RoutingDecision";
DROP TABLE "RoutingDecision";
ALTER TABLE "new_RoutingDecision" RENAME TO "RoutingDecision";
CREATE INDEX "RoutingDecision_entityType_entityId_createdAt_idx" ON "RoutingDecision"("entityType", "entityId", "createdAt");
CREATE INDEX "RoutingDecision_accountId_createdAt_idx" ON "RoutingDecision"("accountId", "createdAt");
CREATE INDEX "RoutingDecision_leadId_createdAt_idx" ON "RoutingDecision"("leadId", "createdAt");
CREATE INDEX "RoutingDecision_assignedOwnerId_createdAt_idx" ON "RoutingDecision"("assignedOwnerId", "createdAt");
CREATE INDEX "RoutingDecision_secondaryOwnerId_createdAt_idx" ON "RoutingDecision"("secondaryOwnerId", "createdAt");
CREATE INDEX "RoutingDecision_triggerSignalId_createdAt_idx" ON "RoutingDecision"("triggerSignalId", "createdAt");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "geography" TEXT NOT NULL,
    "title" TEXT,
    "avatarColor" TEXT,
    "maxOpenHotLeads" INTEGER NOT NULL DEFAULT 3,
    "maxDailyInboundAssignments" INTEGER NOT NULL DEFAULT 6,
    "maxOpenTasks" INTEGER NOT NULL DEFAULT 12,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("avatarColor", "createdAt", "email", "geography", "id", "name", "role", "team", "title", "updatedAt") SELECT "avatarColor", "createdAt", "email", "geography", "id", "name", "role", "team", "title", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
