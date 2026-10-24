import { NextResponse } from "next/server";
import { ZodError } from "zod";
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof ApiError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        error: error.issues
          .map((i) => i.message)
          .slice(0, 3)
          .join(" "),
      },
      { status: 400 },
    );
  return NextResponse.json(
    {
      error:
        "The request could not be completed. Please retry. Check local server configuration if this continues.",
    },
    { status: 500 },
  );
}
export async function api(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json(await fn());
  } catch (error) {
    return errorResponse(error);
  }
}
const buckets = new Map<string, { count: number; until: number }>();
export function limit(key: string, max = 20, duration = 60_000) {
  const now = Date.now();
  for (const [id, bucket] of buckets)
    if (bucket.until < now) buckets.delete(id);
  const bucket = buckets.get(key);
  if (bucket && bucket.until > now && bucket.count >= max)
    throw new ApiError(
      "Too many requests. Please wait a minute and retry.",
      429,
    );
  buckets.set(key, {
    count: bucket && bucket.until > now ? bucket.count + 1 : 1,
    until: bucket && bucket.until > now ? bucket.until : now + duration,
  });
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Next's internal URL may use localhost even when the browser used 127.0.0.1.
  // Host is the actual incoming authority. Do not trust forwarded-host headers.
  if (origin) {
    const internal = new URL(request.url);
    const expected = new URL(
      `${internal.protocol}//${request.headers.get("host") || internal.host}`,
    ).origin;
    if (origin !== expected)
      throw new ApiError("Cross-origin changes are not allowed.", 403);
  }
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site")
    throw new ApiError("Cross-site changes are not allowed.", 403);
}
