import { registerMcpClient } from "@/lib/server/mcpOauth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const client = await registerMcpClient(body || {});
    return Response.json(client, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid_client_metadata";
    return Response.json(
      { error: "invalid_client_metadata", error_description: detail },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
