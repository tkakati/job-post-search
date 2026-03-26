import { apiOk } from "@/lib/api/response";

export const runtime = "nodejs";

export async function GET() {
  return apiOk({ status: "healthy" });
}

