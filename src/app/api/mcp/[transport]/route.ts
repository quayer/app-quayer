import { createMcpAdapter } from '@igniter-js/adapter-mcp-server'
import { AppRouter } from '@/igniter.router'

/**
 * MCP server instance for exposing API as a MCP server.
 *
 * @see https://github.com/felipebarcelospro/igniter-js/tree/main/packages/adapter-mcp
 */
const mcp = createMcpAdapter({
  router: AppRouter,
  serverInfo: {
    name: 'Igniter.js MCP Server',
    version: '1.0.0',
  },
  adapter: {
    basePath: '/api/mcp',
    verboseLogs: true,
    redis: {
      url: process.env.REDIS_URL!,
    },
  },
})

export const GET = mcp.server
export const POST = mcp.server
export const DELETE = mcp.server
