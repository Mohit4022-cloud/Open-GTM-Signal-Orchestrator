import assert from "node:assert/strict";
import { AuditEventType } from "@prisma/client";
import { after, beforeEach, test } from "node:test";

import { POST as accountSummaryPost } from "@/app/api/ai/account-summary/[accountId]/route";
import { POST as actionNotePost } from "@/app/api/ai/action-note/[leadId]/route";
import { db } from "@/lib/db";

import { resetDatabase } from "./helpers/db";

const originalFetch = global.fetch;
const originalEnv = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  AI_REQUEST_TIMEOUT_MS: process.env.AI_REQUEST_TIMEOUT_MS,
};

function restoreAiEnv() {
  process.env.AI_PROVIDER = originalEnv.AI_PROVIDER;
  process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
  process.env.OPENAI_MODEL = originalEnv.OPENAI_MODEL;
  process.env.OPENAI_BASE_URL = originalEnv.OPENAI_BASE_URL;
  process.env.AI_REQUEST_TIMEOUT_MS = originalEnv.AI_REQUEST_TIMEOUT_MS;
}

function configureOpenAiEnv() {
  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "test-model";
  process.env.OPENAI_BASE_URL = "https://api.openai.test/v1";
  process.env.AI_REQUEST_TIMEOUT_MS = "2500";
}

function mockFetchJson(payload: unknown, status = 200) {
  global.fetch = (async () => {
    return new Response(JSON.stringify(payload), {
      status,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;
}

beforeEach(async () => {
  await resetDatabase();
  restoreAiEnv();
  global.fetch = originalFetch;
});

after(async () => {
  await resetDatabase();
  restoreAiEnv();
  global.fetch = originalFetch;
});

test("POST /api/ai/account-summary/:accountId returns generated output and records an audit event", async () => {
  configureOpenAiEnv();
  mockFetchJson({
    choices: [
      {
        message: {
          content: JSON.stringify({
            summary: "SummitFlow is hot because pricing activity, routing ownership, and open work are all active.",
            keyDrivers: [
              "Pricing activity is the latest signal.",
              "The account still has open follow-up work.",
            ],
          }),
        },
      },
    ],
  });

  const response = await accountSummaryPost(
    new Request("http://localhost/api/ai/account-summary/acc_summitflow_finance", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mode: "briefing",
        length: "short",
      }),
    }),
    { params: Promise.resolve({ accountId: "acc_summitflow_finance" }) },
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, "generated");
  assert.equal(payload.provider.name, "openai");
  assert.equal(payload.provider.model, "test-model");
  assert.equal(typeof payload.generatedAt, "string");

  const auditRow = await db.auditLog.findFirst({
    where: {
      eventType: AuditEventType.AI_ACCOUNT_SUMMARY_GENERATED,
      accountId: "acc_summitflow_finance",
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  assert.ok(auditRow);
  assert.equal(auditRow?.action, "ai_account_summary_generated");
});

test("POST /api/ai/account-summary/:accountId returns deterministic unavailable output when no provider is configured", async () => {
  process.env.AI_PROVIDER = "noop";

  const response = await accountSummaryPost(
    new Request("http://localhost/api/ai/account-summary/acc_summitflow_finance", {
      method: "POST",
    }),
    { params: Promise.resolve({ accountId: "acc_summitflow_finance" }) },
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, "unavailable");
  assert.equal(payload.generatedAt, null);
  assert.equal(payload.provider, null);
  assert.ok(payload.summary.length > 0);
  assert.ok(payload.keyDrivers.length > 0);
});

test("POST /api/ai/account-summary/:accountId returns 404 for missing accounts", async () => {
  process.env.AI_PROVIDER = "noop";

  const response = await accountSummaryPost(
    new Request("http://localhost/api/ai/account-summary/acc_missing", {
      method: "POST",
    }),
    { params: Promise.resolve({ accountId: "acc_missing" }) },
  );
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.code, "AI_NOT_FOUND");
});

test("POST /api/ai/account-summary/:accountId returns 500 when the route is forced to fail", async () => {
  const response = await accountSummaryPost(
    new Request("http://localhost/api/ai/account-summary/acc_summitflow_finance", {
      method: "POST",
      headers: {
        "x-force-error": "1",
      },
    }),
    { params: Promise.resolve({ accountId: "acc_summitflow_finance" }) },
  );
  const payload = await response.json();

  assert.equal(response.status, 500);
  assert.equal(payload.code, "AI_INTERNAL_ERROR");
});

test("POST /api/ai/action-note/:leadId returns error status and records a failure audit event when provider output is invalid", async () => {
  configureOpenAiEnv();
  mockFetchJson({
    choices: [
      {
        message: {
          content: "not-json",
        },
      },
    ],
  });

  const response = await actionNotePost(
    new Request("http://localhost/api/ai/action-note/acc_atlas_grid_lead_01", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mode: "outreach",
      }),
    }),
    { params: Promise.resolve({ leadId: "acc_atlas_grid_lead_01" }) },
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, "error");
  assert.equal(payload.generatedAt, null);
  assert.ok(payload.note.length > 0);
  assert.ok(payload.suggestedAngle.length > 0);

  const auditRow = await db.auditLog.findFirst({
    where: {
      eventType: AuditEventType.AI_GENERATION_FAILED,
      leadId: "acc_atlas_grid_lead_01",
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  assert.ok(auditRow);
  assert.equal(auditRow?.action, "ai_generation_failed");
});

test("POST /api/ai/action-note/:leadId returns 400 for invalid body values", async () => {
  process.env.AI_PROVIDER = "noop";

  const response = await actionNotePost(
    new Request("http://localhost/api/ai/action-note/acc_atlas_grid_lead_01", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        length: "long",
      }),
    }),
    { params: Promise.resolve({ leadId: "acc_atlas_grid_lead_01" }) },
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.code, "AI_VALIDATION_ERROR");
});

test("POST /api/ai/action-note/:leadId returns 200 even if audit logging fails", async () => {
  configureOpenAiEnv();
  mockFetchJson({
    choices: [
      {
        message: {
          content: JSON.stringify({
            note: "Lead with Atlas Grid's recent form-fill activity and connect it to the active evaluation path.",
            suggestedAngle: "Follow up on recent form-fill activity.",
          }),
        },
      },
    ],
  });

  const originalCreate = db.auditLog.create;
  Object.defineProperty(db.auditLog, "create", {
    value: async () => {
      throw new Error("Forced audit logging failure.");
    },
    configurable: true,
    writable: true,
  });

  try {
    const response = await actionNotePost(
      new Request("http://localhost/api/ai/action-note/acc_atlas_grid_lead_01", {
        method: "POST",
      }),
      { params: Promise.resolve({ leadId: "acc_atlas_grid_lead_01" }) },
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, "generated");
    assert.ok(payload.note.length > 0);
  } finally {
    Object.defineProperty(db.auditLog, "create", {
      value: originalCreate,
      configurable: true,
      writable: true,
    });
  }
});
