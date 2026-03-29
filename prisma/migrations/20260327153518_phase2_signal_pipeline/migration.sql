/*
  Warnings:

  - Made the column `dedupeKey` on table `SignalEvent` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SignalEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceSystem" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "accountDomain" TEXT,
    "contactEmail" TEXT,
    "accountId" TEXT,
    "contactId" TEXT,
    "leadId" TEXT,
    "eventCategory" TEXT NOT NULL DEFAULT 'MANUAL',
    "intentStrength" TEXT NOT NULL DEFAULT 'NONE',
    "engagementStrength" TEXT NOT NULL DEFAULT 'NONE',
    "payloadSummary" TEXT NOT NULL DEFAULT '',
    "rawPayloadJson" JSONB NOT NULL,
    "normalizedPayloadJson" JSONB NOT NULL,
    "identityResolutionCodesJson" JSONB NOT NULL DEFAULT '[]',
    "occurredAt" DATETIME NOT NULL,
    "receivedAt" DATETIME NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SignalEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SignalEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SignalEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SignalEvent" ("accountId", "contactId", "dedupeKey", "eventType", "id", "leadId", "normalizedPayloadJson", "occurredAt", "rawPayloadJson", "receivedAt", "sourceSystem", "status") SELECT "accountId", "contactId", "dedupeKey", "eventType", "id", "leadId", "normalizedPayloadJson", "occurredAt", "rawPayloadJson", "receivedAt", "sourceSystem", "status" FROM "SignalEvent";
DROP TABLE "SignalEvent";
ALTER TABLE "new_SignalEvent" RENAME TO "SignalEvent";
CREATE UNIQUE INDEX "SignalEvent_dedupeKey_key" ON "SignalEvent"("dedupeKey");
CREATE INDEX "SignalEvent_accountId_idx" ON "SignalEvent"("accountId");
CREATE INDEX "SignalEvent_leadId_idx" ON "SignalEvent"("leadId");
CREATE INDEX "SignalEvent_accountId_occurredAt_idx" ON "SignalEvent"("accountId", "occurredAt");
CREATE INDEX "SignalEvent_status_createdAt_idx" ON "SignalEvent"("status", "createdAt");
CREATE INDEX "SignalEvent_status_occurredAt_idx" ON "SignalEvent"("status", "occurredAt");
CREATE INDEX "SignalEvent_accountDomain_idx" ON "SignalEvent"("accountDomain");
CREATE INDEX "SignalEvent_contactEmail_idx" ON "SignalEvent"("contactEmail");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
