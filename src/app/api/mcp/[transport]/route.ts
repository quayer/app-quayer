// MCP Server temporarily disabled due to build issues
// TODO: Re-enable when @igniter-js/adapter-mcp-server is stable

import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  return NextResponse.json({
    error: 'MCP Server temporarily disabled',
    message: 'The MCP adapter is being updated. Please check back later.'
  }, { status: 503 })
}

export async function POST(request: NextRequest) {
  return NextResponse.json({
    error: 'MCP Server temporarily disabled',
    message: 'The MCP adapter is being updated. Please check back later.'
  }, { status: 503 })
}

export async function DELETE(request: NextRequest) {
  return NextResponse.json({
    error: 'MCP Server temporarily disabled',
    message: 'The MCP adapter is being updated. Please check back later.'
  }, { status: 503 })
}
