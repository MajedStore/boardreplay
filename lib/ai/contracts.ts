import type { z } from "zod";
import type { ProviderId } from "../types";

export type { ProviderId, ProviderInfo } from "../types";
export interface VisionImage {
  id: string;
  mimeType: string;
  base64: string;
  sequence: number;
}
export interface GenerateRequest<T> {
  system: string;
  prompt: string;
  images: VisionImage[];
  schema?: z.ZodType<T>;
  schemaName?: string;
  /** Recover optional provider fields locally before strict content validation. Never infers source units. */
  normalizeOutput?: (value: unknown) => unknown;
}
export interface GenerateResult<T> {
  rawOutput: string;
  structuredOutput?: T;
  model: string;
}
export interface AiProvider {
  readonly id: ProviderId;
  readonly model: string;
  generate<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>>;
}
