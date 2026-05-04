import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "quayer",
    environment: process.env.NODE_ENV ?? "unknown",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
