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
