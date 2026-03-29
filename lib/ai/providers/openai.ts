import type { AiProvider, AiProviderInput } from "@/lib/ai/provider";

type OpenAiProviderConfig = {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractTextFromMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (!isRecord(item)) {
        return [];
      }

      if (typeof item.text === "string") {
        return item.text;
      }

      if (isRecord(item.text) && typeof item.text.value === "string") {
        return item.text.value;
      }

      return [];
    })
    .join("\n")
    .trim();
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    typeof payload.error.message === "string" &&
    payload.error.message.trim().length > 0
  ) {
    return payload.error.message;
  }

  return fallback;
}

async function readResponsePayload(response: Response) {
  const text = await response.text();

  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function requestCompletion(config: OpenAiProviderConfig, input: AiProviderInput) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxOutputTokens ?? 400,
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content: input.systemPrompt,
        },
        {
          role: "user",
          content: input.userPrompt,
        },
      ],
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });

  const payload = await readResponsePayload(response);

  if (!response.ok) {
    throw new Error(
      `OpenAI request failed (${response.status}): ${getErrorMessage(
        payload,
        response.statusText || "Unknown provider error.",
      )}`,
    );
  }

  if (!isRecord(payload) || !Array.isArray(payload.choices) || payload.choices.length === 0) {
    throw new Error("OpenAI response did not include any choices.");
  }

  const firstChoice = payload.choices[0];

  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw new Error("OpenAI response did not include a valid message payload.");
  }

  const text = extractTextFromMessageContent(firstChoice.message.content);

  if (!text) {
    throw new Error("OpenAI response did not include any text content.");
  }

  return text;
}

export function createOpenAiProvider(config: OpenAiProviderConfig): AiProvider {
  return {
    metadata: {
      name: "openai",
      model: config.model,
    },
    async generateText(input) {
      const text = await requestCompletion(config, input);

      return {
        status: "generated" as const,
        text,
        provider: {
          name: "openai",
          model: config.model,
        },
      };
    },
  };
}
