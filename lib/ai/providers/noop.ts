import type { AiProvider } from "@/lib/ai/provider";

export function createNoopAiProvider(message: string): AiProvider {
  return {
    metadata: null,
    async generateText() {
      return {
        status: "unavailable" as const,
        message,
        provider: null,
      };
    },
  };
}
