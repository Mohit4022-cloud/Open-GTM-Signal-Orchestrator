import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import type { AiProvider } from "@/lib/ai";
import { generateAccountSummary, generateActionNote } from "@/lib/ai";

import { resetDatabase } from "./helpers/db";

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await resetDatabase();
});

function createGeneratedProvider(payload: Record<string, unknown>): AiProvider {
  return {
    metadata: {
      name: "openai",
      model: "test-model",
    },
    async generateText() {
      return {
        status: "generated",
        provider: {
          name: "openai",
          model: "test-model",
        },
        text: JSON.stringify(payload),
      };
    },
  };
}

test("generateAccountSummary returns typed generated output with a fake provider", async () => {
  const result = await generateAccountSummary(
    "acc_summitflow_finance",
    { mode: "briefing", length: "short" },
    {
      provider: createGeneratedProvider({
        summary: "SummitFlow remains hot because pricing activity and open follow-up work are converging.",
        keyDrivers: [
          "Pricing page activity is the latest signal.",
          "An open follow-up task is still active.",
        ],
      }),
    },
  );

  assert.ok(result);
  assert.equal(result.status, "generated");
  assert.equal(
    result.summary,
    "SummitFlow remains hot because pricing activity and open follow-up work are converging.",
  );
  assert.deepEqual(result.keyDrivers, [
    "Pricing page activity is the latest signal.",
    "An open follow-up task is still active.",
  ]);
  assert.equal(result.provider?.name, "openai");
  assert.equal(typeof result.generatedAt, "string");
});

test("generateAccountSummary returns deterministic fallback output when AI is unavailable", async () => {
  const unavailableProvider: AiProvider = {
    metadata: null,
    async generateText() {
      return {
        status: "unavailable",
        message: "AI provider is not configured.",
        provider: null,
      };
    },
  };

  const result = await generateAccountSummary("acc_summitflow_finance", {}, { provider: unavailableProvider });

  assert.ok(result);
  assert.equal(result.status, "unavailable");
  assert.equal(result.generatedAt, null);
  assert.equal(result.provider, null);
  assert.ok(result.summary.length > 0);
  assert.ok(result.keyDrivers.length > 0);
  assert.equal(result.message, "AI provider is not configured.");
});

test("generateActionNote returns typed generated output with the deterministic guardrail", async () => {
  const result = await generateActionNote(
    "acc_atlas_grid_lead_01",
    { mode: "outreach", length: "short" },
    {
      provider: createGeneratedProvider({
        note: "Lead with the recent form-fill momentum and connect it to the lead's active evaluation path.",
        suggestedAngle: "Follow up on active form-fill momentum.",
      }),
    },
  );

  assert.ok(result);
  assert.equal(result.status, "generated");
  assert.equal(
    result.note,
    "Lead with the recent form-fill momentum and connect it to the lead's active evaluation path.",
  );
  assert.equal(result.suggestedAngle, "Follow up on active form-fill momentum.");
  assert.ok(result.deterministicGuardrail.includes("source of truth"));
});

test("generateActionNote falls back cleanly when the provider returns invalid JSON", async () => {
  const invalidJsonProvider: AiProvider = {
    metadata: {
      name: "openai",
      model: "test-model",
    },
    async generateText() {
      return {
        status: "generated",
        provider: {
          name: "openai",
          model: "test-model",
        },
        text: "not-json",
      };
    },
  };

  const result = await generateActionNote("acc_atlas_grid_lead_01", {}, { provider: invalidJsonProvider });

  assert.ok(result);
  assert.equal(result.status, "error");
  assert.equal(result.generatedAt, null);
  assert.equal(result.provider?.name, "openai");
  assert.ok(result.note.length > 0);
  assert.ok(result.suggestedAngle.length > 0);
  assert.ok(result.message?.includes("JSON"), `Expected JSON parse error, received: ${result.message}`);
});

test("generateActionNote falls back cleanly when the provider throws", async () => {
  const throwingProvider: AiProvider = {
    metadata: {
      name: "openai",
      model: "test-model",
    },
    async generateText() {
      throw new Error("Provider request failed.");
    },
  };

  const result = await generateActionNote("acc_atlas_grid_lead_01", {}, { provider: throwingProvider });

  assert.ok(result);
  assert.equal(result.status, "error");
  assert.equal(result.generatedAt, null);
  assert.equal(result.message, "Provider request failed.");
  assert.ok(result.note.length > 0);
  assert.ok(result.suggestedAngle.length > 0);
  assert.ok(result.deterministicGuardrail.includes("source of truth"));
});
