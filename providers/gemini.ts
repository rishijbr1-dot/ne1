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

export class GeminiProvider implements TextGenerationProvider {
  readonly id = "gemini";
  readonly model = process.env.OPENFARS_CONTENT_MODEL || "gemini-3.8-flash";

  get configured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  async generateText(prompt: string, format: "text" | "json"): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new ProviderUnavailableError();
    let response: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 8192, temperature: 0.35, ...(format === "json" ? { responseMimeType: "application/json" } : {}) },
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
    const text = data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("").trim();
    if (!text) throw new ProviderGenerationError("provider_empty_response", "The configured content provider returned no text.");
    return text;
  }
}