import { api, sameOrigin, limit } from "@/lib/api";
import { configureProvider } from "@/lib/ai/configure";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return api(async () => {
    sameOrigin(request);
    limit("configure-provider", 10);
    return configureProvider(await request.json());
  });
}
