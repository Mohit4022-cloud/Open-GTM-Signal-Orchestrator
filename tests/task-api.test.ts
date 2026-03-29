import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { TaskStatus } from "@prisma/client";

import { GET as tasksGet, POST as tasksPost } from "@/app/api/tasks/route";
import { PATCH as taskPatch } from "@/app/api/tasks/[id]/route";

import { resetDatabase } from "./helpers/db";

before(async () => {
  await resetDatabase();
});

after(async () => {
  await resetDatabase();
});

test("GET /api/tasks returns frontend-safe filtered queue rows", async () => {
  const response = await tasksGet(
    new Request(
      "http://localhost/api/tasks?tracked=true&slaState=on_track&priorityCode=P1",
    ),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.ok(payload.totalCount >= 1);
  assert.ok(
    payload.rows.every(
      (task: {
        priorityCode: string;
        createdAtIso: string;
        owner: { id: string | null; name: string | null } | null;
        linkedEntity: { entityType: string; entityId: string };
        reasonSummary: { primaryCode: string | null };
        explanation: { summary: string };
        sla: { isTracked: boolean; currentState: string };
      }) =>
        task.priorityCode === "P1" &&
        typeof task.createdAtIso === "string" &&
        typeof task.linkedEntity.entityType === "string" &&
        typeof task.linkedEntity.entityId === "string" &&
        "primaryCode" in task.reasonSummary &&
        typeof task.explanation.summary === "string" &&
        task.sla.isTracked === true &&
        task.sla.currentState === "on_track",
    ),
  );
});

test("POST /api/tasks creates manual tasks and PATCH /api/tasks/:id updates status", async () => {
  const createResponse = await tasksPost(
    new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        accountId: "acc_meridian_freight",
        ownerId: "usr_amelia_ross",
        taskType: "REVIEW",
        priorityCode: "P4",
        dueAtIso: "2026-03-30T18:00:00.000Z",
        title: "Review Meridian renewal path",
        description: "Confirm the renewal stakeholder map and capture any expansion blockers.",
      }),
    }),
  );
  const created = await createResponse.json();

  assert.equal(createResponse.status, 201);
  assert.equal(created.actionType, "MANUAL_CUSTOM");
  assert.equal(created.priorityCode, "P4");
  assert.equal(created.status, "OPEN");

  const patchResponse = await taskPatch(
    new Request(`http://localhost/api/tasks/${created.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        status: TaskStatus.COMPLETED,
        priorityCode: "P2",
      }),
    }),
    { params: Promise.resolve({ id: created.id }) },
  );
  const updated = await patchResponse.json();

  assert.equal(patchResponse.status, 200);
  assert.equal(updated.status, "COMPLETED");
  assert.equal(updated.priorityCode, "P2");
  assert.equal(typeof updated.completedAtIso, "string");
  assert.ok(updated.sla);
  assert.equal(updated.sla.currentState, "completed");
});

test("POST /api/tasks returns 400 for invalid payloads", async () => {
  const response = await tasksPost(
    new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        accountId: "acc_meridian_freight",
        priorityCode: "P4",
        dueAtIso: "not-a-date",
        description: "",
      }),
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.code, "TASK_VALIDATION_ERROR");
});

test("PATCH /api/tasks/:id returns 404 when the task does not exist", async () => {
  const response = await taskPatch(
    new Request("http://localhost/api/tasks/missing-task", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        status: TaskStatus.IN_PROGRESS,
      }),
    }),
    { params: Promise.resolve({ id: "missing-task" }) },
  );
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.code, "TASK_NOT_FOUND");
});

test("GET /api/tasks returns 500 when the queue query throws", async () => {
  const response = await tasksGet(
    new Request("http://localhost/api/tasks", {
      headers: {
        "x-force-error": "1",
      },
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 500);
  assert.equal(payload.code, "TASK_INTERNAL_ERROR");
});
