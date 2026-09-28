export type GenerationFormat = "text" | "json";

export type ProviderErrorCode =
  | "provider_unavailable"
  | "provider_timeout"
  | "provider_request_failed"
  | "provider_empty_response"
  | "provider_invalid_json"
  | "provider_unknown";

export interface TextGenerationProvider {
  id: string;
  model: string;
  configured: boolean;
  generateText(prompt: string, format: GenerationFormat): Promise<string>;
}

export class ProviderUnavailableError extends Error {
  readonly code: ProviderErrorCode = "provider_unavailable";

  constructor(apiKeyEnv = "GEMINI_API_KEY") {
    super(`No content generation provider is configured. Set ${apiKeyEnv} in the server environment to enable generation.`);
  }
}

export class ProviderGenerationError extends Error {
  constructor(readonly code: ProviderErrorCode, message: string) {
    super(message);
  }
}