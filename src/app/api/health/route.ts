import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** İzleme ve yük dengeleyici için sağlık kontrolü. Ayrıntı vermez. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
