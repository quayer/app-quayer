import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

async function getServer() {
  const { createMcpAdapter } = await import('@igniter-js/adapter-mcp-server')
  const { AppRouter } = await import('@/igniter.router')
  const mcp = createMcpAdapter({
    router: AppRouter,
    serverInfo: { name: 'Igniter.js MCP Server', version: '1.0.0' },
    adapter: {
      basePath: '/api/mcp',
      verboseLogs: true,
      redis: { url: process.env.REDIS_URL! },
    },
  })
  return mcp.server
}

export async function GET(req: NextRequest, ctx: unknown) { const s = await getServer(); return s(req, ctx) }
export async function POST(req: NextRequest, ctx: unknown) { const s = await getServer(); return s(req, ctx) }
export async function DELETE(req: NextRequest, ctx: unknown) { const s = await getServer(); return s(req, ctx) }
