import { z } from "zod";

import type {
  ActionNoteRequest,
  ActionNoteResponseContract,
} from "@/lib/contracts/ai";

import { buildActionNoteContext } from "./context";
import type { AiProvider } from "./provider";
import { resolveAiProviderFromEnv } from "./provider";
import { buildActionNotePrompt } from "./prompts";
import { DETERMINISTIC_GUARDRAIL, extractJsonObject } from "./shared";

const actionNoteOutputSchema = z.object({
  note: z.string().trim().min(1),
  suggestedAngle: z.string().trim().min(1),
});

type ActionNoteDeps = {
  provider?: AiProvider;
  now?: Date;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "AI action note generation failed.";
}

export async function generateActionNote(
  leadId: string,
  options: ActionNoteRequest = {},
  deps: ActionNoteDeps = {},
): Promise<ActionNoteResponseContract | null> {
  const context = await buildActionNoteContext(leadId, options);

  if (!context) {
    return null;
  }

  const provider = deps.provider ?? resolveAiProviderFromEnv();
  const prompt = buildActionNotePrompt(context);

  try {
    const result = await provider.generateText({
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      maxOutputTokens: prompt.maxOutputTokens,
      temperature: 0.2,
    });

    if (result.status === "unavailable") {
      return {
        leadId,
        status: "unavailable",
        note: context.fallbackNote,
        suggestedAngle: context.fallbackSuggestedAngle,
        generatedAt: null,
        sourceSummary: context.sourceSummary,
        deterministicGuardrail: DETERMINISTIC_GUARDRAIL,
        provider: null,
        message: result.message,
      };
    }

    const parsed = actionNoteOutputSchema.parse(JSON.parse(extractJsonObject(result.text)));
    const generatedAt = (deps.now ?? new Date()).toISOString();

    return {
      leadId,
      status: "generated",
      note: parsed.note.trim(),
      suggestedAngle: parsed.suggestedAngle.trim(),
      generatedAt,
      sourceSummary: context.sourceSummary,
      deterministicGuardrail: DETERMINISTIC_GUARDRAIL,
      provider: result.provider,
      message: null,
    };
  } catch (error) {
    return {
      leadId,
      status: "error",
      note: context.fallbackNote,
      suggestedAngle: context.fallbackSuggestedAngle,
      generatedAt: null,
      sourceSummary: context.sourceSummary,
      deterministicGuardrail: DETERMINISTIC_GUARDRAIL,
      provider: provider.metadata,
      message: getErrorMessage(error),
    };
  }
}
