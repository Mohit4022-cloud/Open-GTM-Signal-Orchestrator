import { z } from "zod";

import type {
  AccountSummaryRequest,
  AccountSummaryResponseContract,
} from "@/lib/contracts/ai";

import { buildAccountSummaryContext } from "./context";
import type { AiProvider } from "./provider";
import { resolveAiProviderFromEnv } from "./provider";
import { buildAccountSummaryPrompt } from "./prompts";
import { extractJsonObject } from "./shared";

const accountSummaryOutputSchema = z
  .object({
    summary: z.string().trim().min(1),
    keyDrivers: z.array(z.string().trim().min(1)).min(1),
  })
  .transform((value) => ({
    summary: value.summary.trim(),
    keyDrivers: [...new Set(value.keyDrivers.map((item) => item.trim()).filter(Boolean))].slice(0, 4),
  }))
  .refine((value) => value.keyDrivers.length > 0, {
    message: "At least one key driver is required.",
    path: ["keyDrivers"],
  });

type AccountSummaryDeps = {
  provider?: AiProvider;
  now?: Date;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "AI account summary generation failed.";
}

export async function generateAccountSummary(
  accountId: string,
  options: AccountSummaryRequest = {},
  deps: AccountSummaryDeps = {},
): Promise<AccountSummaryResponseContract | null> {
  const context = await buildAccountSummaryContext(accountId, options);

  if (!context) {
    return null;
  }

  const provider = deps.provider ?? resolveAiProviderFromEnv();
  const prompt = buildAccountSummaryPrompt(context);

  try {
    const result = await provider.generateText({
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      maxOutputTokens: prompt.maxOutputTokens,
      temperature: 0.2,
    });

    if (result.status === "unavailable") {
      return {
        accountId,
        status: "unavailable",
        summary: context.fallbackSummary,
        keyDrivers: context.fallbackKeyDrivers,
        generatedAt: null,
        sourceSummary: context.sourceSummary,
        provider: null,
        message: result.message,
      };
    }

    const parsed = accountSummaryOutputSchema.parse(JSON.parse(extractJsonObject(result.text)));
    const generatedAt = (deps.now ?? new Date()).toISOString();

    return {
      accountId,
      status: "generated",
      summary: parsed.summary,
      keyDrivers: parsed.keyDrivers,
      generatedAt,
      sourceSummary: context.sourceSummary,
      provider: result.provider,
      message: null,
    };
  } catch (error) {
    return {
      accountId,
      status: "error",
      summary: context.fallbackSummary,
      keyDrivers: context.fallbackKeyDrivers,
      generatedAt: null,
      sourceSummary: context.sourceSummary,
      provider: provider.metadata,
      message: getErrorMessage(error),
    };
  }
}
