/**
 * API Documentation Route
 *
 * Expõe a documentação OpenAPI da API
 */

import { NextResponse } from 'next/server'
import { AppRouterSchema } from '@/igniter.schema'

export async function GET() {
  const openapi = AppRouterSchema.docs.openapi

  // Retornar OpenAPI spec como JSON
  return NextResponse.json(openapi, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
