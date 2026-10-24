import "server-only";
import type { ProviderId, ProviderInfo } from "../types";
import { AiError } from "./errors";

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  openai: "gpt-5.4-mini",
  gemini: "gemini-3.6-flash",
  anthropic: "claude-sonnet-4-6",
};
const KEY_NAMES: Record<ProviderId, string> = {
  openai: "OPENAI_API_KEY",
  gemini: "GOOGLE_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};
const MODEL_NAMES: Record<ProviderId, string> = {
  openai: "OPENAI_MODEL",
  gemini: "GEMINI_MODEL",
  anthropic: "ANTHROPIC_MODEL",
};
const DISPLAY_NAMES: Record<ProviderId, string> = {
  openai: "OpenAI",
  gemini: "Google Gemini",
  anthropic: "Anthropic Claude",
};

export function getProviders(): ProviderInfo[] {
  return (["openai", "gemini", "anthropic"] as const).map((id) => ({
    id,
    name: DISPLAY_NAMES[id],
    model: process.env[MODEL_NAMES[id]]?.trim() || DEFAULT_MODELS[id],
    configured: Boolean(process.env[KEY_NAMES[id]]?.trim()),
  }));
}

export function getProviderConfiguration(id: ProviderId): {
  apiKey: string;
  model: string;
} {
  if (typeof window !== "undefined")
    throw new Error("AI provider configuration is server-only.");
  const info = getProviders().find((provider) => provider.id === id);
  const apiKey = process.env[KEY_NAMES[id]]?.trim();
  if (!info || !apiKey)
    throw new AiError(
      "MISSING_CONFIGURATION",
      "This AI provider is not configured. Add its API key to the server .env file, or explore the clearly labeled sample lesson.",
    );
  return { apiKey, model: info.model };
}
