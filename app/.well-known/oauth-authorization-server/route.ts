import { MCP_SCOPES, ORACLE_ORIGIN } from "@/lib/server/mcpOauth";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(
    {
      issuer: ORACLE_ORIGIN,
      authorization_response_iss_parameter_supported: true,
      authorization_endpoint: ORACLE_ORIGIN + "/oauth/authorize",
      token_endpoint: ORACLE_ORIGIN + "/oauth/token",
      registration_endpoint: ORACLE_ORIGIN + "/oauth/register",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: MCP_SCOPES,
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
