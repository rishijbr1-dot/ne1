import { ProviderGenerationError, ProviderUnavailableError, type TextGenerationProvider } from "./types.js";

function safeProviderErrorMessage(body: string, apiKey: string): string {
  let message: unknown;
  try {
    message = JSON.parse(body)?.error?.message;
  } catch {
    return "The provider did not return a readable error message.";
  }
  if (typeof message !== "string") return "The provider did not return a readable error message.";
  const safeMessage = message
    .replaceAll(apiKey, "[redacted]")
    .replaceAll(encodeURIComponent(apiKey), "[redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return safeMessage || "The provider did not return a readable error message.";
}

export class OpenAIProvider implements TextGenerationProvider {
  readonly id = "openai";
  readonly model = process.env.OPENFARS_CONTENT_MODEL || "gpt-5.6-sol";

  get configured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async generateText(prompt: string, format: "text" | "json"): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ProviderUnavailableError("OPENAI_API_KEY");
    let response: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            messages: [{ role: "user", content: prompt }],
            ...(format === "json" ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: AbortSignal.timeout(60000),
        });
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") throw new ProviderGenerationError("provider_timeout", "The configured content provider timed out.");
        throw new ProviderGenerationError("provider_request_failed", "The configured content provider could not be reached.");
      }

      if (response.ok) break;
      const retryable = [429, 500, 502, 503].includes(response.status);
      if (!retryable || attempt === 2) {
        const body = await response.text().catch(() => "");
        const providerMessage = safeProviderErrorMessage(body, apiKey);
        throw new ProviderGenerationError("provider_request_failed", `The configured content provider returned HTTP ${response.status}: ${providerMessage}`);
      }
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 1000 : 2000));
    }

    if (!response?.ok) throw new ProviderGenerationError("provider_request_failed", "The configured content provider could not be reached.");
    const data: any = await response.json().catch(() => null);
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new ProviderGenerationError("provider_empty_response", "The configured content provider returned no text.");
    return text.trim();
  }
}