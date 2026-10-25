import type { GenerateRequest } from "./contracts";

/** Providers share the same local recovery boundary; model-facing schemas stay strict. */
export function parseStructuredOutput<T>(request: GenerateRequest<T>, rawOutput: string): T {
  if (!request.schema) throw new Error("Structured parsing requires a response schema.");
  const value: unknown = JSON.parse(rawOutput);
  return request.schema.parse(request.normalizeOutput ? request.normalizeOutput(value) : value);
}
