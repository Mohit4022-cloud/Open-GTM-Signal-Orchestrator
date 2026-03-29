import type { AiProviderMetadataContract } from "@/lib/contracts/ai";

import { createNoopAiProvider } from "./providers/noop";
import { createOpenAiProvider } from "./providers/openai";

export type AiProviderInput = {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
};

export type AiProviderGeneratedResult = {
  status: "generated";
  text: string;
  provider: AiProviderMetadataContract;
};

export type AiProviderUnavailableResult = {
  status: "unavailable";
  message: string;
  provider: null;
};

export type AiProviderInvocationResult =
  | AiProviderGeneratedResult
  | AiProviderUnavailableResult;

export type AiProvider = {
  metadata: AiProviderMetadataContract | null;
  generateText(input: AiProviderInput): Promise<AiProviderInvocationResult>;
};

function parseTimeoutMs(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10_000;
  }

  return parsed;
}

function normalizeBaseUrl(value: string | undefined) {
  return value?.trim().replace(/\/+$/, "") || "https://api.openai.com/v1";
}

export function resolveAiProviderFromEnv(env: NodeJS.ProcessEnv = process.env): AiProvider {
  const provider = env.AI_PROVIDER?.trim().toLowerCase();

  if (!provider || provider === "noop") {
    return createNoopAiProvider("AI provider is not configured. Showing deterministic fallback output.");
  }

  if (provider !== "openai") {
    return createNoopAiProvider(
      `AI provider "${provider}" is not supported. Showing deterministic fallback output.`,
    );
  }

  if (!env.OPENAI_API_KEY?.trim() || !env.OPENAI_MODEL?.trim()) {
    return createNoopAiProvider(
      "OpenAI is selected but OPENAI_API_KEY or OPENAI_MODEL is missing. Showing deterministic fallback output.",
    );
  }

  return createOpenAiProvider({
    apiKey: env.OPENAI_API_KEY.trim(),
    model: env.OPENAI_MODEL.trim(),
    baseUrl: normalizeBaseUrl(env.OPENAI_BASE_URL),
    timeoutMs: parseTimeoutMs(env.AI_REQUEST_TIMEOUT_MS),
  });
}
