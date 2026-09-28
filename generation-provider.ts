import { resolveContentProvider, selectedContentProviderId } from "./providers/registry.js";
import { ProviderGenerationError, ProviderUnavailableError } from "./providers/types.js";

export { ProviderGenerationError, ProviderUnavailableError };

export function generationProviderStatus() {
  let provider;
  try {
    provider = resolveContentProvider();
  } catch {
    return { provider: "unknown", model: null, configured: false };
  }
  return { provider: provider.id, model: provider.configured ? provider.model : null, configured: provider.configured };
}

export async function generateStructuredOutput<T>(prompt: string): Promise<T> {
  const provider = resolveContentProvider(selectedContentProviderId());
  if (!provider.configured) throw new ProviderUnavailableError();
  const text = await provider.generateText(prompt, "json");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderGenerationError("provider_invalid_json", "The configured content provider returned invalid JSON; no content was stored.");
  }
}