import { getProviders } from "@/lib/ai/config";
import { api } from "@/lib/api";
export const runtime = "nodejs";
export async function GET() {
  return api(async () => getProviders());
}
