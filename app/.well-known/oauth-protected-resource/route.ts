import { MCP_RESOURCE, MCP_SCOPES, ORACLE_ORIGIN } from "@/lib/server/mcpOauth";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(
    {
      resource: MCP_RESOURCE,
      authorization_servers: [ORACLE_ORIGIN],
      scopes_supported: MCP_SCOPES,
      resource_documentation: ORACLE_ORIGIN,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
