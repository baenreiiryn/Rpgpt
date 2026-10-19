import {
  exchangeMcpAuthorizationCode,
  validateOauthResource,
} from "@/lib/server/mcpOauth";

export const runtime = "nodejs";

function oauthError(error: string, description: string, status = 400) {
  return Response.json(
    { error, error_description: description },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const form = await request.formData();
  const grantType = String(form.get("grant_type") || "");
  if (grantType !== "authorization_code") {
    return oauthError("unsupported_grant_type", "Only authorization_code is supported.");
  }

  const code = String(form.get("code") || "");
  const clientId = String(form.get("client_id") || "");
  const redirectUri = String(form.get("redirect_uri") || "");
  const codeVerifier = String(form.get("code_verifier") || "");
  const resource = String(form.get("resource") || "");

  if (!code || !clientId || !redirectUri || !codeVerifier || !resource) {
    return oauthError("invalid_request", "Missing OAuth token parameters.");
  }

  try {
    validateOauthResource(resource);
    const token = await exchangeMcpAuthorizationCode({
      code,
      clientId,
      redirectUri,
      codeVerifier,
      resource,
    });
    return Response.json(token, {
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    });
  } catch (error) {
    const codeName = error instanceof Error ? error.message : "invalid_grant";
    const publicCode = ["invalid_grant", "invalid_target"].includes(codeName)
      ? codeName
      : "invalid_grant";
    return oauthError(publicCode, "The authorization code could not be exchanged.");
  }
}
