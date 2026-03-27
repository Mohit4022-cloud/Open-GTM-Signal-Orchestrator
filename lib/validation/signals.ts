import { z } from "zod";

import { ingestibleSignalEventTypes, type IngestSignalInput } from "@/lib/contracts/signals";

const payloadSchema = z.object({}).catchall(z.unknown());

export const ingestSignalSchema = z.object({
  source_system: z.string().trim().min(1, "source_system is required"),
  event_type: z.enum(ingestibleSignalEventTypes, {
    error: () => "event_type is not supported",
  }),
  account_domain: z.string().trim().min(1).optional().nullable(),
  contact_email: z.email().optional().nullable(),
  occurred_at: z.iso.datetime(),
  received_at: z.iso.datetime().optional().nullable(),
  payload: payloadSchema,
});

export type ValidatedIngestSignalInput = z.infer<typeof ingestSignalSchema>;

export function parseSignalInput(input: unknown): IngestSignalInput {
  return ingestSignalSchema.parse(input);
}

export function safeParseSignalInput(input: unknown) {
  return ingestSignalSchema.safeParse(input);
}
