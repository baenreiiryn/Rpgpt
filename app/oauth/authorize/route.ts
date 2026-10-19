import {
  createMcpAuthorizationCode,
  getMcpClient,
  MCP_RESOURCE,
  normalizeScope,
  ORACLE_ORIGIN,
  validateOauthResource,
} from "@/lib/server/mcpOauth";
import { createPluginCampaign, loadCampaignByToken } from "@/lib/server/pluginCampaign";

export const runtime = "nodejs";

type Params = {
  responseType: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  resource: string;
};

const esc = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char] || char);

function paramsFromUrl(url: URL): Params {
  return {
    responseType: url.searchParams.get("response_type") || "",
    clientId: url.searchParams.get("client_id") || "",
    redirectUri: url.searchParams.get("redirect_uri") || "",
    state: url.searchParams.get("state") || "",
    codeChallenge: url.searchParams.get("code_challenge") || "",
    codeChallengeMethod: url.searchParams.get("code_challenge_method") || "",
    scope: url.searchParams.get("scope") || "",
    resource: url.searchParams.get("resource") || "",
  };
}

function paramsFromForm(form: FormData): Params {
  return {
    responseType: String(form.get("response_type") || ""),
    clientId: String(form.get("client_id") || ""),
    redirectUri: String(form.get("redirect_uri") || ""),
    state: String(form.get("state") || ""),
    codeChallenge: String(form.get("code_challenge") || ""),
    codeChallengeMethod: String(form.get("code_challenge_method") || ""),
    scope: String(form.get("scope") || ""),
    resource: String(form.get("resource") || ""),
  };
}

async function validateParams(params: Params) {
  if (params.responseType !== "code") throw new Error("unsupported_response_type");
  if (!params.clientId || !params.redirectUri || !params.codeChallenge) {
    throw new Error("invalid_request");
  }
  if (params.codeChallengeMethod !== "S256") throw new Error("invalid_request");
  const client = await getMcpClient(params.clientId);
  if (!client || !client.redirectUris.includes(params.redirectUri)) {
    throw new Error("invalid_client");
  }
  validateOauthResource(params.resource);
  const scope = normalizeScope(params.scope);
  return { client, scope };
}

function hidden(name: string, value: string) {
  return '<input type="hidden" name="' + esc(name) + '" value="' + esc(value) + '">';
}

function render(params: Params, clientName: string, error = "", generatedPairCode = "") {
  const hiddenHtml = [
    hidden("response_type", params.responseType),
    hidden("client_id", params.clientId),
    hidden("redirect_uri", params.redirectUri),
    hidden("state", params.state),
    hidden("code_challenge", params.codeChallenge),
    hidden("code_challenge_method", params.codeChallengeMethod),
    hidden("scope", params.scope),
    hidden("resource", params.resource),
  ].join("");

  const errorHtml = error
    ? '<div class="error">' + esc(error) + "</div>"
    : "";
  const generatedHtml = generatedPairCode
    ? [
        '<div class="created">',
        '<strong>Nova campanha criada</strong>',
        '<p>Guarde este código para abrir a mesma campanha em outro dispositivo.</p>',
        '<div class="pair"><code id="pair-code">' + esc(generatedPairCode) + '</code><button type="button" onclick="navigator.clipboard.writeText(document.getElementById(\'pair-code\').textContent);this.textContent=\'Copiado ✓\'">Copiar</button></div>',
        "</div>",
      ].join("")
    : "";

  return [
    "<!doctype html>",
    '<html lang="pt-BR"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    "<title>Conectar OracleRPG</title>",
    "<style>",
    ":root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at 50% 0,#211333,#08070c 50%);color:#f4efe5;font-family:Inter,system-ui,sans-serif}",
    ".card{width:min(440px,100%);border:1px solid #49365b;background:linear-gradient(145deg,#171020,#0b0910);border-radius:22px;padding:28px;box-shadow:0 30px 100px #0008}.sigil{width:62px;height:62px;margin:auto;border-radius:50%;border:1px solid #604676;display:grid;place-items:center;color:#ddbf7a;font-size:26px}",
    ".eyebrow{text-align:center;color:#a77ae8;font-size:9px;letter-spacing:.18em;font-weight:800;margin-top:12px}h1{text-align:center;font:500 28px Georgia,serif;margin:7px 0 8px}p{color:#aaa0b2;font-size:12px;line-height:1.6;text-align:center}",
    ".client{border:1px solid #30243b;background:#0a080f;border-radius:11px;padding:10px 12px;margin:16px 0;font-size:10px;color:#b9aac5}.client b{color:#e6daed}.field{display:block;margin-top:14px}.field span{display:block;font-size:9px;color:#998ca5;letter-spacing:.11em;text-transform:uppercase;margin-bottom:6px}",
    ".field input{width:100%;border:1px solid #3a2c47;background:#09070d;color:#f1e9f5;border-radius:10px;padding:12px;outline:none}.field input:focus{border-color:#77559a}.button{width:100%;border:0;border-radius:11px;padding:12px;margin-top:12px;background:linear-gradient(135deg,#875dc8,#5d3da1);color:white;font-weight:700;cursor:pointer}",
    ".error{border:1px solid #733a49;background:#2b1118;color:#e8a9b2;border-radius:10px;padding:9px 11px;font-size:10px;margin:12px 0}.note{font-size:10px;color:#756b7e;margin-top:15px}.created{border:1px solid #416c5c;background:#0d211a;border-radius:12px;padding:12px;margin:14px 0}.created strong{display:block;color:#9ed7bd;font-size:12px}.created p{text-align:left;margin:5px 0 9px;color:#8fad9f;font-size:10px}.pair{display:grid;grid-template-columns:1fr auto;gap:7px;align-items:center}.pair code{overflow:auto;white-space:nowrap;border:1px solid #305246;background:#08120f;border-radius:8px;padding:9px;color:#b9e5d2;font-size:9px}.pair button{border:1px solid #416c5c;background:#163126;color:#b9e5d2;border-radius:8px;padding:8px 10px;cursor:pointer;font-size:9px}",
    '</style></head><body><main class="card">',
    '<div class="sigil">◈</div><div class="eyebrow">ORACLE RPG</div>',
    "<h1>Conectar sua campanha</h1>",
    "<p>O ChatGPT está solicitando acesso ao OracleRPG. Informe um código existente ou deixe o campo vazio para criar uma nova campanha.</p>",
    '<div class="client">Solicitado por <b>' + esc(clientName) + '</b><br>Permissões: ler e atualizar a campanha.</div>',
    errorHtml,
    generatedHtml,
    '<form method="post" action="/oauth/authorize">',
    hiddenHtml,
    '<label class="field"><span>Código de pareamento <em style="font-style:normal;color:#655d70">(opcional)</em></span><input name="pair_code" type="' + (generatedPairCode ? "text" : "password") + '" autocomplete="off" value="' + esc(generatedPairCode) + '" placeholder="Deixe vazio para criar uma nova campanha"></label>',
    '<button class="button" type="submit">' + (generatedPairCode ? "Continuar e conectar ChatGPT" : "Continuar") + "</button>",
    "</form>",
    '<p class="note">Se você já usa o OracleRPG em outro dispositivo, informe o código existente. Caso contrário, um novo será criado automaticamente. O código não é enviado como argumento para o modelo.</p>',
    "</main></body></html>",
  ].join("");
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
    },
  });
}

export async function GET(request: Request) {
  const params = paramsFromUrl(new URL(request.url));
  try {
    const { client, scope } = await validateParams(params);
    params.scope = scope;
    return html(render(params, client.clientName));
  } catch {
    return html("<h1>Solicitação OAuth inválida.</h1>", 400);
  }
}

export async function POST(request: Request) {
  const form = await request.formData();
  const params = paramsFromForm(form);
  try {
    const { client, scope } = await validateParams(params);
    params.scope = scope;
    const pairCode = String(form.get("pair_code") || "").trim();
    if (!pairCode) {
      const created = await createPluginCampaign();
      return html(render(params, client.clientName, "", created.pairCode));
    }
    const campaign = await loadCampaignByToken(pairCode);
    if (!campaign) {
      return html(render(params, client.clientName, "Código de pareamento inválido."));
    }
    const code = await createMcpAuthorizationCode({
      clientId: params.clientId,
      campaignId: campaign.id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      scope,
      resource: MCP_RESOURCE,
    });
    const redirect = new URL(params.redirectUri);
    redirect.searchParams.set("code", code);
    if (params.state) redirect.searchParams.set("state", params.state);
    redirect.searchParams.set("iss", ORACLE_ORIGIN);
    return Response.redirect(redirect, 302);
  } catch {
    return html("<h1>Não foi possível autorizar a campanha.</h1>", 400);
  }
}
