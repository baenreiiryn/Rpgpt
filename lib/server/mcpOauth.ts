import { db } from "@/lib/server/db";
import { pkceChallenge, randomToken, sha256 } from "@/lib/server/crypto";

export const ORACLE_ORIGIN = "https://oraclerpg.vercel.app";
export const MCP_RESOURCE = ORACLE_ORIGIN + "/api/mcp";
export const MCP_SCOPES = ["campaign:read", "campaign:write"] as const;

let tablesPromise: Promise<void> | null = null;

export function ensureMcpOauthTables() {
  if (tablesPromise) return tablesPromise;
  tablesPromise = (async () => {
    const sql = db();
    await sql`
      CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
        client_id text PRIMARY KEY,
        redirect_uris jsonb NOT NULL,
        client_name text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
        code_hash text PRIMARY KEY,
        client_id text NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
        campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        redirect_uri text NOT NULL,
        code_challenge text NOT NULL,
        scope text NOT NULL,
        resource text NOT NULL,
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS mcp_oauth_codes_expires_at_idx
      ON mcp_oauth_codes (expires_at)
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS mcp_oauth_tokens (
        token_hash text PRIMARY KEY,
        client_id text NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
        campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        scope text NOT NULL,
        resource text NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_expires_at_idx
      ON mcp_oauth_tokens (expires_at)
    `;
  })().catch((error) => {
    tablesPromise = null;
    throw error;
  });
  return tablesPromise;
}

function validRedirectUri(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname === "chatgpt.com";
  } catch {
    return false;
  }
}

export async function registerMcpClient(input: {
  redirect_uris?: unknown;
  client_name?: unknown;
  token_endpoint_auth_method?: unknown;
}) {
  await ensureMcpOauthTables();
  const redirects = Array.isArray(input.redirect_uris)
    ? input.redirect_uris.filter((value): value is string => typeof value === "string")
    : [];
  if (!redirects.length || redirects.length > 8 || redirects.some((value) => !validRedirectUri(value))) {
    throw new Error("invalid_redirect_uris");
  }
  if (
    input.token_endpoint_auth_method !== undefined &&
    input.token_endpoint_auth_method !== "none"
  ) {
    throw new Error("unsupported_token_endpoint_auth_method");
  }

  const clientId = "oraclerpg_" + randomToken(20);
  const clientName = typeof input.client_name === "string" ? input.client_name.slice(0, 120) : "ChatGPT";
  const sql = db();
  await sql`
    INSERT INTO mcp_oauth_clients (client_id, redirect_uris, client_name)
    VALUES (${clientId}, ${JSON.stringify(redirects)}::jsonb, ${clientName})
  `;
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: redirects,
    client_name: clientName,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
  };
}

export async function getMcpClient(clientId: string) {
  await ensureMcpOauthTables();
  const sql = db();
  const rows = await sql`
    SELECT client_id, redirect_uris, client_name
    FROM mcp_oauth_clients
    WHERE client_id = ${clientId}
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return {
    clientId: String(rows[0].client_id),
    redirectUris: rows[0].redirect_uris as string[],
    clientName: rows[0].client_name ? String(rows[0].client_name) : "ChatGPT",
  };
}

export function normalizeScope(scope: string | null | undefined) {
  const requested = String(scope || "").split(/\s+/).filter(Boolean);
  const allowed = requested.length ? requested : [...MCP_SCOPES];
  if (allowed.some((value) => !MCP_SCOPES.includes(value as (typeof MCP_SCOPES)[number]))) {
    throw new Error("invalid_scope");
  }
  return Array.from(new Set(allowed)).join(" ");
}

export function validateOauthResource(resource: string | null | undefined) {
  if (resource !== MCP_RESOURCE) throw new Error("invalid_resource");
  return MCP_RESOURCE;
}

export async function createMcpAuthorizationCode(input: {
  clientId: string;
  campaignId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  resource: string;
}) {
  await ensureMcpOauthTables();
  const code = randomToken(32);
  const sql = db();
  await sql`
    INSERT INTO mcp_oauth_codes (
      code_hash, client_id, campaign_id, redirect_uri,
      code_challenge, scope, resource, expires_at
    )
    VALUES (
      ${sha256(code)}, ${input.clientId}, ${input.campaignId}::uuid, ${input.redirectUri},
      ${input.codeChallenge}, ${input.scope}, ${input.resource}, now() + interval '10 minutes'
    )
  `;
  return code;
}

export async function exchangeMcpAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource: string;
}) {
  await ensureMcpOauthTables();
  const sql = db();
  const rows = await sql`
    SELECT code_hash, client_id, campaign_id, redirect_uri, code_challenge, scope, resource
    FROM mcp_oauth_codes
    WHERE code_hash = ${sha256(input.code)}
      AND consumed_at IS NULL
      AND expires_at > now()
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new Error("invalid_grant");
  if (String(row.client_id) !== input.clientId) throw new Error("invalid_grant");
  if (String(row.redirect_uri) !== input.redirectUri) throw new Error("invalid_grant");
  if (String(row.resource) !== input.resource) throw new Error("invalid_target");
  if (pkceChallenge(input.codeVerifier) !== String(row.code_challenge)) throw new Error("invalid_grant");

  const consumed = await sql`
    UPDATE mcp_oauth_codes
    SET consumed_at = now()
    WHERE code_hash = ${sha256(input.code)}
      AND consumed_at IS NULL
    RETURNING campaign_id
  `;
  if (!consumed[0]) throw new Error("invalid_grant");

  const accessToken = randomToken(40);
  const expiresIn = 60 * 60 * 24 * 30;
  await sql`
    INSERT INTO mcp_oauth_tokens (
      token_hash, client_id, campaign_id, scope, resource, expires_at
    )
    VALUES (
      ${sha256(accessToken)}, ${input.clientId}, ${String(row.campaign_id)}::uuid,
      ${String(row.scope)}, ${input.resource}, now() + interval '30 days'
    )
  `;
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn,
    scope: String(row.scope),
    resource: input.resource,
  };
}

export async function getMcpAccessGrant(accessToken: string) {
  if (!accessToken) return null;
  await ensureMcpOauthTables();
  const sql = db();
  const rows = await sql`
    SELECT client_id, campaign_id, scope, resource, expires_at
    FROM mcp_oauth_tokens
    WHERE token_hash = ${sha256(accessToken)}
      AND expires_at > now()
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return {
    clientId: String(rows[0].client_id),
    campaignId: String(rows[0].campaign_id),
    scopes: String(rows[0].scope).split(/\s+/).filter(Boolean),
    resource: String(rows[0].resource),
    expiresAt: new Date(String(rows[0].expires_at)).getTime(),
  };
}

