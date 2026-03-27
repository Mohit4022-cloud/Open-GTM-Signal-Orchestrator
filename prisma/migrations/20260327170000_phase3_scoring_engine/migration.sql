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
    CONSTRAINT "Account_namedOwnerId_fkey" FOREIGN KEY ("namedOwnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Account" (
    "accountTier",
    "annualRevenueBand",
    "createdAt",
    "domain",
    "employeeCount",
    "fitScore",
    "geography",
    "id",
    "industry",
    "lifecycleStage",
    "name",
    "namedOwnerId",
    "overallScore",
    "segment",
    "status",
    "updatedAt"
)
SELECT
    "accountTier",
    "annualRevenueBand",
    "createdAt",
    "domain",
    "employeeCount",
    "fitScore",
    "geography",
    "id",
    "industry",
    "lifecycleStage",
    "name",
    "namedOwnerId",
    "overallScore",
    "segment",
    "status",
    "updatedAt"
FROM "Account";

DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE UNIQUE INDEX "Account_domain_key" ON "Account"("domain");
CREATE INDEX "Account_segment_geography_idx" ON "Account"("segment", "geography");
CREATE INDEX "Account_overallScore_idx" ON "Account"("overallScore");
CREATE INDEX "Account_temperature_overallScore_idx" ON "Account"("temperature", "overallScore");
CREATE INDEX "Account_namedOwnerId_idx" ON "Account"("namedOwnerId");

CREATE TABLE "new_Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT,
    "source" TEXT NOT NULL,
    "inboundType" TEXT NOT NULL,
    "currentOwnerId" TEXT,
    "status" TEXT NOT NULL,
    "fitScore" INTEGER NOT NULL DEFAULT 0,
    "intentScore" INTEGER NOT NULL DEFAULT 0,
    "engagementScore" INTEGER NOT NULL DEFAULT 0,
    "recencyScore" INTEGER NOT NULL DEFAULT 0,
    "productUsageScore" INTEGER NOT NULL DEFAULT 0,
    "manualPriorityScore" INTEGER NOT NULL DEFAULT 0,
    "manualPriorityBoost" INTEGER NOT NULL DEFAULT 0,
    "manualPriorityNote" TEXT,
    "manualPriorityUpdatedAt" DATETIME,
    "score" INTEGER NOT NULL,
    "temperature" TEXT NOT NULL,
    "scoreBreakdownJson" JSONB NOT NULL DEFAULT '{}',
    "scoreReasonCodesJson" JSONB NOT NULL DEFAULT '[]',
    "scoreExplanationJson" JSONB NOT NULL DEFAULT '{}',
    "scoreLastComputedAt" DATETIME,
    "scoringVersion" TEXT NOT NULL DEFAULT 'scoring/v1',
    "slaDeadlineAt" DATETIME,
    "firstResponseAt" DATETIME,
    "routedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lead_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Lead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lead_currentOwnerId_fkey" FOREIGN KEY ("currentOwnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Lead" (
    "accountId",
    "contactId",
    "createdAt",
    "currentOwnerId",
    "firstResponseAt",
    "id",
    "inboundType",
    "routedAt",
    "score",
    "slaDeadlineAt",
    "source",
    "status",
    "temperature",
    "updatedAt"
)
SELECT
    "accountId",
    "contactId",
    "createdAt",
    "currentOwnerId",
    "firstResponseAt",
    "id",
    "inboundType",
    "routedAt",
    "score",
    "slaDeadlineAt",
    "source",
    "status",
    "temperature",
    "updatedAt"
FROM "Lead";

DROP TABLE "Lead";
ALTER TABLE "new_Lead" RENAME TO "Lead";
CREATE INDEX "Lead_accountId_idx" ON "Lead"("accountId");
CREATE INDEX "Lead_currentOwnerId_idx" ON "Lead"("currentOwnerId");
CREATE INDEX "Lead_status_temperature_idx" ON "Lead"("status", "temperature");

CREATE TABLE "new_ScoreHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "accountId" TEXT,
    "leadId" TEXT,
    "previousScore" INTEGER NOT NULL,
    "newScore" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "previousTemperature" TEXT NOT NULL,
    "newTemperature" TEXT NOT NULL,
    "componentBreakdownJson" JSONB NOT NULL,
    "reasonCodesJson" JSONB NOT NULL,
    "explanationJson" JSONB NOT NULL,
    "triggerType" TEXT NOT NULL,
    "triggerSignalId" TEXT,
    "triggerMetadataJson" JSONB,
    "scoringVersion" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScoreHistory_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScoreHistory_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScoreHistory_triggerSignalId_fkey" FOREIGN KEY ("triggerSignalId") REFERENCES "SignalEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

DROP TABLE "ScoreHistory";
ALTER TABLE "new_ScoreHistory" RENAME TO "ScoreHistory";
CREATE INDEX "ScoreHistory_accountId_createdAt_idx" ON "ScoreHistory"("accountId", "createdAt");
CREATE INDEX "ScoreHistory_leadId_createdAt_idx" ON "ScoreHistory"("leadId", "createdAt");
CREATE INDEX "ScoreHistory_entityType_entityId_createdAt_idx" ON "ScoreHistory"("entityType", "entityId", "createdAt");
CREATE INDEX "ScoreHistory_triggerSignalId_createdAt_idx" ON "ScoreHistory"("triggerSignalId", "createdAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE INDEX "SignalEvent_accountId_occurredAt_status_idx" ON "SignalEvent"("accountId", "occurredAt", "status");
CREATE INDEX "SignalEvent_contactId_occurredAt_idx" ON "SignalEvent"("contactId", "occurredAt");
