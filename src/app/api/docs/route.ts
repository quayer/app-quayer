import { AppRouterSchema } from "@/igniter.schema";
import { NextResponse } from "next/server";

export async function GET() {
  // SECURITY: Never expose the full OpenAPI spec in production.
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not Found', { status: 404 });
  }

  const spec = AppRouterSchema.docs?.openapi ?? {};

  return NextResponse.json(spec, {
    headers: {
      'Access-Control-Allow-Origin': 'http://localhost:3000',
      'Content-Type': 'application/json',
    },
  });
}
