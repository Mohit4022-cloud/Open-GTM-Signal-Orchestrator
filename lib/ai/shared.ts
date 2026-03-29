import type { SlaCurrentState } from "@/lib/contracts/sla";

export const DETERMINISTIC_GUARDRAIL =
  "Deterministic scoring, routing, task generation, SLA tracking, and audit logic remain the source of truth.";

const SLA_RISK_STATES = new Set<SlaCurrentState>(["due_soon", "overdue", "breached"]);

export function isSlaRiskState(state: SlaCurrentState) {
  return SLA_RISK_STATES.has(state);
}

export function humanizeCode(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (part) => part.toUpperCase());
}

export function joinHumanList(values: string[]) {
  if (values.length === 0) {
    return "";
  }

  if (values.length === 1) {
    return values[0]!;
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

export function extractJsonObject(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    throw new Error("AI response was empty.");
  }

  const unfenced = trimmed.startsWith("```")
    ? trimmed
        .replace(/^```[a-zA-Z0-9_-]*\s*/, "")
        .replace(/\s*```$/, "")
        .trim()
    : trimmed;

  if (unfenced.startsWith("{") && unfenced.endsWith("}")) {
    return unfenced;
  }

  const firstBrace = unfenced.indexOf("{");
  const lastBrace = unfenced.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
    throw new Error("AI response did not contain a JSON object.");
  }

  return unfenced.slice(firstBrace, lastBrace + 1);
}
