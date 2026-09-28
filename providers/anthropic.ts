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

export class AnthropicProvider implements TextGenerationProvider {
  readonly id = "anthropic";
  readonly model = process.env.OPENFARS_CONTENT_MODEL || "claude-opus-4-8";

  get configured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async generateText(prompt: string, format: "text" | "json"): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new ProviderUnavailableError("ANTHROPIC_API_KEY");
    let response: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 8192,
            messages: [{ role: "user", content: prompt }],
            ...(format === "json" ? {
              tools: [{
                name: "return_json",
                description: "Return the requested result as a JSON object.",
                input_schema: { type: "object" },
              }],
              tool_choice: { type: "tool", name: "return_json" },
            } : {}),
          }),
          signal: AbortSignal.timeout(60000),
        });
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") throw new ProviderGenerationError("provider_timeout", "The configured content provider timed out.");
        throw new ProviderGenerationError("provider_request_failed", "The configured content provider could not be reached.");
      }

      if (response.ok) break;
      const retryable = [429, 500, 502, 503, 504, 529].includes(response.status);
      if (!retryable || attempt === 2) {
        const body = await response.text().catch(() => "");
        const providerMessage = safeProviderErrorMessage(body, apiKey);
        throw new ProviderGenerationError("provider_request_failed", `The configured content provider returned HTTP ${response.status}: ${providerMessage}`);
      }
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 1000 : 2000));
    }

    if (!response?.ok) throw new ProviderGenerationError("provider_request_failed", "The configured content provider could not be reached.");
    const data: any = await response.json().catch(() => null);
    if (format === "json") {
      const output = data?.content?.find((block: any) => block.type === "tool_use" && block.name === "return_json")?.input;
      if (output === null || typeof output !== "object" || Array.isArray(output)) {
        throw new ProviderGenerationError("provider_empty_response", "The configured content provider returned no text.");
      }
      return JSON.stringify(output);
    }

    const text = data?.content?.filter((block: any) => block.type === "text").map((block: any) => block.text || "").join("").trim();
    if (!text) throw new ProviderGenerationError("provider_empty_response", "The configured content provider returned no text.");
    return text;
  }
}