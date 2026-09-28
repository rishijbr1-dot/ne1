import { resolveContentProvider, selectedContentProviderId } from "./providers/registry.js";
import { ProviderGenerationError, ProviderUnavailableError } from "./providers/types.js";

export { ProviderGenerationError, ProviderUnavailableError };

const PROVIDER_PRIORITY = ["gemini", "openai", "anthropic"];

function fallbackEnabled(): boolean {
  return process.env.OPENFARS_CONTENT_FALLBACK === "true";
}

function fallbackOrder(selectedProviderId: string): string[] {
  return [selectedProviderId, ...PROVIDER_PRIORITY.filter((providerId) => providerId !== selectedProviderId)];
}

function isTransientProviderError(error: unknown): boolean {
  if (!(error instanceof ProviderGenerationError)) return false;
  if (["provider_timeout", "provider_empty_response"].includes(error.code)) return true;
  if (error.code !== "provider_request_failed") return false;
  const httpStatus = error.message.match(/\bHTTP (\d{3})\b/)?.[1];
  return httpStatus ? httpStatus === "429" || Number(httpStatus) >= 500 : true;
}

export function generationProviderStatus() {
  const enabled = fallbackEnabled();
  const providerId = selectedContentProviderId();
  const fallback = { enabled, order: enabled ? fallbackOrder(providerId) : [] };
  let provider;
  try {
    provider = resolveContentProvider(providerId);
  } catch {
    return { provider: "unknown", model: null, configured: false, fallback };
  }
  return { provider: provider.id, model: provider.configured ? provider.model : null, configured: provider.configured, fallback };
}

async function generateTextWithFallback(prompt: string, format: "text" | "json"): Promise<string> {
  const enabled = fallbackEnabled();
  const order = enabled ? fallbackOrder(selectedContentProviderId()) : [selectedContentProviderId()];
  let lastError: unknown;

  for (const providerId of order) {
    const provider = resolveContentProvider(providerId);
    if (!provider.configured) {
      if (providerId === order[0]) await provider.generateText(prompt, format);
      continue;
    }

    try {
      return await provider.generateText(prompt, format);
    } catch (error) {
      if (!enabled || !isTransientProviderError(error)) throw error;
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  throw new ProviderUnavailableError();
}

export async function generateStructuredOutput<T>(prompt: string): Promise<T> {
  const text = await generateTextWithFallback(prompt, "json");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderGenerationError("provider_invalid_json", "The configured content provider returned invalid JSON; no content was stored.");
  }
}