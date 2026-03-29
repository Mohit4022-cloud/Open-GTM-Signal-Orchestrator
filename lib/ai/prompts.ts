import type { AccountSummaryAiContext, ActionNoteAiContext } from "@/lib/ai/context";

import { DETERMINISTIC_GUARDRAIL } from "./shared";

function getLengthInstruction(length: "short" | "medium") {
  return length === "short"
    ? "Keep the output tight: 2-3 sentences and no more than 3 key points."
    : "Keep the output concise but complete: one short paragraph and up to 4 key points.";
}

function getAccountModeInstruction(mode: "default" | "briefing" | "timeline") {
  switch (mode) {
    case "briefing":
      return "Write for a sales rep who needs a quick pre-call briefing.";
    case "timeline":
      return "Emphasize the most recent timeline events and what changed.";
    default:
      return "Explain why the account is hot and what an operator should know next.";
  }
}

function getActionModeInstruction(mode: "default" | "outreach") {
  if (mode === "outreach") {
    return "Write as a rep-ready outreach note with a clear angle.";
  }

  return "Write as an internal action note that prepares the next deterministic step.";
}

export function buildAccountSummaryPrompt(context: AccountSummaryAiContext) {
  return {
    systemPrompt: [
      "You are the assistive AI layer for GTM Signal Orchestrator.",
      DETERMINISTIC_GUARDRAIL,
      "Use only the facts provided in the structured context.",
      "Do not invent owners, scores, routing decisions, SLA states, or task states.",
      "Do not recommend changing deterministic routing or action logic.",
      'Return strict JSON with this shape: {"summary":"string","keyDrivers":["string"]}.',
    ].join(" "),
    userPrompt: [
      getAccountModeInstruction(context.requestedMode),
      getLengthInstruction(context.requestedLength),
      "Focus on grounded reasons the account is hot, the most relevant recent signals, any routing or SLA risk, and the current open-work context.",
      "FACTS:",
      JSON.stringify(context.promptContext, null, 2),
    ].join("\n\n"),
    maxOutputTokens: context.requestedLength === "short" ? 220 : 360,
  };
}

export function buildActionNotePrompt(context: ActionNoteAiContext) {
  return {
    systemPrompt: [
      "You are the assistive AI layer for GTM Signal Orchestrator.",
      DETERMINISTIC_GUARDRAIL,
      "Use only the facts provided in the structured context.",
      "Do not invent owners, scores, routing decisions, SLA states, or task states.",
      "Do not replace or override deterministic action logic.",
      'Return strict JSON with this shape: {"note":"string","suggestedAngle":"string"}.',
    ].join(" "),
    userPrompt: [
      getActionModeInstruction(context.requestedMode),
      getLengthInstruction(context.requestedLength),
      "Ground the note in the lead score reasons, recent signals, open tasks, SLA context, and routing context.",
      "FACTS:",
      JSON.stringify(context.promptContext, null, 2),
    ].join("\n\n"),
    maxOutputTokens: context.requestedLength === "short" ? 220 : 320,
  };
}
