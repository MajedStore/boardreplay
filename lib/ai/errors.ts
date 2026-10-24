export type AiErrorCode =
  | "MISSING_CONFIGURATION"
  | "AUTHENTICATION"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "INVALID_OUTPUT"
  | "INCOMPLETE_OUTPUT"
  | "PROVIDER_ERROR"
  | "INVALID_INPUT";

export class AiError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

/** Public messages are fixed text: SDK errors can contain request data or secrets. */
export function safeAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  const record =
    error && typeof error === "object"
      ? (error as { status?: number; name?: string; code?: string })
      : {};
  if (record.status === 401 || record.status === 403)
    return new AiError(
      "AUTHENTICATION",
      "The provider rejected its server API credentials or model permissions. Check your server environment configuration.",
    );
  if (record.status === 429)
    return new AiError(
      "RATE_LIMIT",
      "The provider rate limit or quota was reached. Check your provider account and try again later.",
    );
  if (record.name === "ZodError" || record.name === "SyntaxError")
    return new AiError(
      "INVALID_OUTPUT",
      "The provider returned invalid structured data. Review the photographs and try again.",
    );
  if (record.name === "LengthFinishReasonError")
    return new AiError(
      "INCOMPLETE_OUTPUT",
      "The provider returned an incomplete response. Try fewer photographs in one lesson.",
    );
  if (
    record.status === 408 ||
    record.status === 504 ||
    record.name?.includes("Timeout") ||
    record.name === "AbortError" ||
    record.code === "ETIMEDOUT"
  )
    return new AiError(
      "TIMEOUT",
      "The provider timed out. Your photographs are saved; try processing again.",
    );
  return new AiError(
    "PROVIDER_ERROR",
    "The AI provider could not complete the request. Check the configured model and provider availability, then try again.",
  );
}

export async function withBoundedRetry<T>(
  operation: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const record =
        error && typeof error === "object"
          ? (error as { status?: number; name?: string })
          : {};
      const transient =
        record.status === 408 ||
        record.status === 429 ||
        (record.status !== undefined && record.status >= 500) ||
        record.name === "APIConnectionError" ||
        record.name === "APIConnectionTimeoutError";
      if (!transient || attempt >= 2) throw safeAiError(error);
      await new Promise((resolve) => setTimeout(resolve, 700 * 2 ** attempt));
    }
  }
}
