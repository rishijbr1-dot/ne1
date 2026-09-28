import { AnthropicProvider } from "./anthropic.js";
import { GeminiProvider } from "./gemini.js";
import { OpenAIProvider } from "./openai.js";
import { ProviderGenerationError, type TextGenerationProvider } from "./types.js";

const providers = new Map<string, TextGenerationProvider>([
  ["gemini", new GeminiProvider()],
  ["openai", new OpenAIProvider()],
  ["anthropic", new AnthropicProvider()],
]);

export const DEFAULT_CONTENT_PROVIDER = "gemini";

export function selectedContentProviderId(): string {
  return process.env.OPENFARS_CONTENT_PROVIDER || DEFAULT_CONTENT_PROVIDER;
}

export function resolveContentProvider(providerId = selectedContentProviderId()): TextGenerationProvider {
  const provider = providers.get(providerId);
  if (!provider) {
    throw new ProviderGenerationError("provider_unknown", "Unknown content generation provider. Set OPENFARS_CONTENT_PROVIDER to a registered provider id.");
  }
  return provider;
}