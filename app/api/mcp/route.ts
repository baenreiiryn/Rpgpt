import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import type { AuthInfo } from "@modelcontextprotocol/server";
import type { GameState, Memory, Message, Npc } from "@/lib/game";
import { ORACLE_UI_MIME, ORACLE_UI_URI, oracleAppHtml } from "@/lib/server/oracleMcpUi";
import {
  applyOracleTool,
  loadCampaignByToken,
  mutateCampaignByToken,
} from "@/lib/server/pluginCampaign";
import {
  getMcpAccessGrant,
  MCP_RESOURCE,
  ORACLE_ORIGIN,
} from "@/lib/server/mcpOauth";

export const runtime = "nodejs";
export const maxDuration = 30;

function tokenFromContext(ctx: unknown) {
  const auth = (ctx as { http?: { authInfo?: AuthInfo } })?.http?.authInfo;
  if (!auth?.token) throw new Error("OracleRPG campaign is not connected.");
  return auth.token;
}

function compactState(state: GameState) {
  return {
    campaign: state.campaign,
    character: state.character,
    inventory: state.inventory,
    quests: state.quests,
    npcs: state.npcs,
    memories: state.memories.slice(0, 80),
    messages: state.messages.slice(-40),
    recentEvents: state.events.slice(0, 20),
  };
}

function reply(state: GameState, message?: string) {
  return {
    content: message ? [{ type: "text" as const, text: message }] : [],
    structuredContent: { state: compactState(state) },
  };
}

const handler = createMcpHandler(
  (server) => {
    server.registerResource(
      "OracleRPG",
      ORACLE_UI_URI,
      {
        title: "OracleRPG",
        description: "Interface completa da campanha OracleRPG.",
        mimeType: ORACLE_UI_MIME,
        _meta: {
          ui: {
            prefersBorder: false,
            domain: "https://oraclerpg.vercel.app",
            csp: {
              connectDomains: ["https://oraclerpg.vercel.app"],
              resourceDomains: ["https://oraclerpg.vercel.app"],
            },
          },
          "openai/ui": { availableDisplayModes: ["fullscreen"] },
        },
      },
      async () => ({
        contents: [
          {
            uri: ORACLE_UI_URI,
            mimeType: ORACLE_UI_MIME,
            text: oracleAppHtml,
            _meta: {
              ui: {
                prefersBorder: false,
                domain: "https://oraclerpg.vercel.app",
                csp: {
                  connectDomains: ["https://oraclerpg.vercel.app"],
                  resourceDomains: ["https://oraclerpg.vercel.app"],
                },
              },
              "openai/ui": { availableDisplayModes: ["fullscreen"] },
            },
          },
        ],
      }),
    );

    server.registerTool(
      "open_oracle",
      {
        title: "Open OracleRPG",
        description: "Open the OracleRPG campaign interface. Use when the user wants to play, inspect the campaign, or open the RPG app.",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true },
        _meta: {
          ui: { resourceUri: ORACLE_UI_URI },
          "openai/ui": { entrypoints: [{ type: "global" }] },
        },
      },
      async (_args, ctx) => {
        const campaign = await loadCampaignByToken(tokenFromContext(ctx));
        if (!campaign) throw new Error("Campaign not found.");
        return reply(campaign.state, "OracleRPG opened.");
      },
    );

    server.registerTool(
      "get_campaign_state",
      {
        title: "Read campaign state",
        description: "Read the authoritative OracleRPG campaign state before narrating or making decisions.",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true },
        _meta: { ui: { visibility: ["model", "app"] } },
      },
      async (_args, ctx) => {
        const campaign = await loadCampaignByToken(tokenFromContext(ctx));
        if (!campaign) throw new Error("Campaign not found.");
        return reply(campaign.state);
      },
    );

    server.registerTool(
      "character_adjust_resource",
      {
        title: "Adjust character resource",
        description: "Change HP, Hope, Stress, or Armor in OracleRPG when fiction or rules require it.",
        inputSchema: z.object({
          resource: z.enum(["hp", "hope", "stress", "armor"]),
          amount: z.number().int(),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async ({ resource, amount }, ctx) => {
        const result = await mutateCampaignByToken(tokenFromContext(ctx), (state) =>
          applyOracleTool(state, { type: "adjust", resource, amount }),
        );
        return reply(result.state, resource.toUpperCase() + " adjusted by " + amount + ".");
      },
    );

    server.registerTool(
      "inventory_adjust",
      {
        title: "Adjust inventory",
        description: "Add or remove a quantity of an existing OracleRPG inventory item.",
        inputSchema: z.object({ itemId: z.string().min(1), amount: z.number().int() }),
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async ({ itemId, amount }, ctx) => {
        const result = await mutateCampaignByToken(tokenFromContext(ctx), (state) =>
          applyOracleTool(state, { type: "inventory", itemId, amount }),
        );
        return reply(result.state, "Inventory updated.");
      },
    );

    server.registerTool(
      "quest_set_status",
      {
        title: "Set quest status",
        description: "Mark a known OracleRPG quest active or completed.",
        inputSchema: z.object({
          questId: z.string().min(1),
          status: z.enum(["active", "completed"]),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async ({ questId, status }, ctx) => {
        const result = await mutateCampaignByToken(tokenFromContext(ctx), (state) =>
          applyOracleTool(state, { type: "quest", questId, status }),
        );
        return reply(result.state, "Quest updated.");
      },
    );

    server.registerTool(
      "condition_set",
      {
        title: "Set condition",
        description: "Apply or remove a named condition from the active character.",
        inputSchema: z.object({ name: z.string().min(1), active: z.boolean() }),
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async ({ name, active }, ctx) => {
        const result = await mutateCampaignByToken(tokenFromContext(ctx), (state) =>
          applyOracleTool(state, { type: "condition", name, active }),
        );
        return reply(result.state, "Condition updated.");
      },
    );

    server.registerTool(
      "memory_search",
      {
        title: "Search campaign memory",
        description: "Search persistent OracleRPG memories for lore, visual details, events, facts, or secrets relevant to the current turn.",
        inputSchema: z.object({
          query: z.string(),
          limit: z.number().int().min(1).max(20).default(8),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ query, limit }, ctx) => {
        const campaign = await loadCampaignByToken(tokenFromContext(ctx));
        if (!campaign) throw new Error("Campaign not found.");
        const words = query.toLocaleLowerCase("pt-BR").split(/\s+/).filter((word) => word.length > 2);
        const memories = campaign.state.memories
          .map((memory) => ({
            memory,
            score: words.reduce((score, word) =>
              score + (memory.text.toLocaleLowerCase("pt-BR").includes(word) ? 1 : 0), 0),
          }))
          .filter((entry) => entry.score > 0 || words.length === 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map((entry) => entry.memory);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(memories) }],
          structuredContent: { memories },
        };
      },
    );

    server.registerTool(
      "memory_record",
      {
        title: "Record campaign memory",
        description: "Persist a durable fact, event, secret, or stable visual characteristic in OracleRPG.",
        inputSchema: z.object({
          kind: z.enum(["fact", "event", "secret", "visual"]),
          text: z.string().min(1),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async ({ kind, text }, ctx) => {
        const result = await mutateCampaignByToken(tokenFromContext(ctx), (state) =>
          applyOracleTool(state, { type: "memory", kind: kind as Memory["kind"], text }),
        );
        return reply(result.state, "Memory recorded.");
      },
    );

    server.registerTool(
      "append_message",
      {
        title: "Append OracleRPG message",
        description: "Persist a player action or final GM narration in the OracleRPG session log. Call this with role=gm after every narrated turn.",
        inputSchema: z.object({
          role: z.enum(["gm", "player", "system"]),
          text: z.string().min(1),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false },
        _meta: { ui: { visibility: ["model", "app"] } },
      },
      async ({ role, text }, ctx) => {
        const result = await mutateCampaignByToken(tokenFromContext(ctx), (state) => {
          const message: Message = {
            id: crypto.randomUUID(),
            role,
            text,
            createdAt: new Date().toISOString(),
          };
          return { ...state, messages: [...state.messages, message] };
        });
        return reply(result.state, "Message saved.");
      },
    );

    server.registerTool(
      "set_scene",
      {
        title: "Set current scene",
        description: "Update the current OracleRPG scene name/location when play moves somewhere else.",
        inputSchema: z.object({ scene: z.string().min(1) }),
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async ({ scene }, ctx) => {
        const result = await mutateCampaignByToken(tokenFromContext(ctx), (state) => ({
          ...state,
          campaign: { ...state.campaign, scene },
        }));
        return reply(result.state, "Scene updated.");
      },
    );

    server.registerTool(
      "npc_upsert",
      {
        title: "Create or update NPC",
        description: "Create a new NPC or update a known NPC in the persistent OracleRPG world.",
        inputSchema: z.object({
          id: z.string().min(1),
          name: z.string().min(1),
          role: z.string().min(1),
          relation: z.enum(["friendly", "neutral", "hostile"]),
          location: z.string().min(1),
          appearance: z.string().optional(),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async (npc, ctx) => {
        const result = await mutateCampaignByToken(tokenFromContext(ctx), (state) => {
          const nextNpc: Npc = npc;
          const exists = state.npcs.some((entry) => entry.id === npc.id);
          return {
            ...state,
            npcs: exists
              ? state.npcs.map((entry) => entry.id === npc.id ? { ...entry, ...nextNpc } : entry)
              : [...state.npcs, nextNpc],
          };
        });
        return reply(result.state, "NPC saved.");
      },
    );
  },
  {
    serverInfo: { name: "OracleRPG", version: "0.2.0" },
    instructions: [
      "OracleRPG is the authoritative RPG state and interface. You are the game master behind it.",
      "Before resolving a player action, call get_campaign_state. Use memory_search when prior lore or appearance matters.",
      "Use OracleRPG write tools whenever HP, Hope, Stress, Armor, inventory, conditions, quests, scene, NPCs, or persistent memories change.",
      "Never invent a stored mechanical value when it can be read from OracleRPG.",
      "Narrate in Brazilian Portuguese unless the player asks otherwise. Keep narration and dialogue in separate paragraphs.",
      "Do not decide the player character's choices. Describe consequences and ask what the player does when appropriate.",
      "After producing the final narration for a turn, call append_message with role=gm and the exact final narration so the OracleRPG fullscreen UI stays synchronized.",
      "When the user asks to illustrate the scene, read campaign state and visual memories first, then use ChatGPT's native image-generation capability if available.",
    ].join("\n"),
  },
);

async function verifyCampaignToken(_request: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const grant = await getMcpAccessGrant(bearerToken);
  if (!grant || grant.resource !== MCP_RESOURCE) return undefined;
  return {
    token: bearerToken,
    clientId: grant.clientId,
    scopes: grant.scopes,
    expiresAt: Math.floor(grant.expiresAt / 1000),
  };
}

const authenticated = withMcpAuth(handler, verifyCampaignToken, {
  required: true,
  requiredScopes: ["campaign:read"],
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
  resourceUrl: ORACLE_ORIGIN,
});

export { authenticated as GET, authenticated as POST, authenticated as DELETE };
