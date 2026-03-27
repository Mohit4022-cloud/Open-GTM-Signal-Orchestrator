import { z } from "zod";

import type { IngestSignalInput, JsonRecord, UploadSignalsCsvParsedRow } from "@/lib/contracts/signals";

const csvSignalRowSchema = z
  .object({
    source_system: z.string().trim().min(1, "source_system is required"),
    event_type: z.string().trim().min(1, "event_type is required"),
    occurred_at: z.string().trim().min(1, "occurred_at is required"),
    account_domain: z.string().trim().optional(),
    contact_email: z.string().trim().optional(),
    received_at: z.string().trim().optional(),
    payload_json: z.string().trim().optional(),
  })
  .catchall(z.string());

const reservedCsvColumns = new Set([
  "source_system",
  "event_type",
  "occurred_at",
  "account_domain",
  "contact_email",
  "received_at",
  "payload_json",
]);

function getExtraPayloadColumns(row: UploadSignalsCsvParsedRow): JsonRecord {
  return Object.entries(row).reduce<JsonRecord>((payload, [key, value]) => {
    if (reservedCsvColumns.has(key) || value.trim().length === 0) {
      return payload;
    }

    payload[key] = value.trim();
    return payload;
  }, {});
}

function parsePayloadJson(value: string | undefined): JsonRecord {
  if (!value || value.trim().length === 0) {
    return {};
  }

  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload_json must contain a JSON object.");
  }

  return parsed as JsonRecord;
}

export function parseCsvSignalRow(row: UploadSignalsCsvParsedRow): IngestSignalInput {
  const parsedRow = csvSignalRowSchema.parse(row);
  const payloadJson = parsePayloadJson(parsedRow.payload_json);
  const extraPayload = getExtraPayloadColumns(row);

  return {
    source_system: parsedRow.source_system,
    event_type: parsedRow.event_type as IngestSignalInput["event_type"],
    account_domain: parsedRow.account_domain || undefined,
    contact_email: parsedRow.contact_email || undefined,
    occurred_at: parsedRow.occurred_at,
    received_at: parsedRow.received_at || undefined,
    payload: {
      ...payloadJson,
      ...extraPayload,
    },
  };
}
