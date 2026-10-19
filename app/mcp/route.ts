import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { executeCommand, buildContextPacket } from "@/lib/game";
import { mutateCampaign, parsePairCode, readCampaign } from "@/lib/server/campaign-store";

export const runtime = "nodejs";
export const maxDuration = 30;

const pairCode = z.string().min(10).describe(
  "Código de pareamento da campanha OracleRPG no formato campaignId.syncKey. Use somente o código fornecido pelo jogador.",
);

function text(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function failure(error: unknown) {
  return {
    isError: true,
    content: [{
      type: "text" as const,
      text: error instanceof Error ? error.message : "Falha inesperada no OracleRPG.",
    }],
  };
}

const handler = createMcpHandler((server) => {
  server.registerTool(
    "get_campaign_state",
    {
      title: "Ler campanha OracleRPG",
      description: "Leia o estado atual da campanha antes de narrar ou quando precisar confirmar cena, personagem, inventário, missões, NPCs ou memórias. Não invente estado que esta ferramenta possa fornecer.",
      inputSchema: z.object({ pairCode }),
    },
    async ({ pairCode }) => {
      try {
        const campaign = await readCampaign(parsePairCode(pairCode));
        return text({
          campaignId: campaign.id,
          version: campaign.version,
          context: buildContextPacket(campaign.state),
          inventory: campaign.state.inventory,
          quests: campaign.state.quests,
          npcs: campaign.state.npcs,
        });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "adjust_character_resource",
    {
      title: "Alterar recurso do personagem",
      description: "Ajuste HP, Esperança, Estresse ou Armadura quando a ficção ou as regras da campanha exigirem. A alteração é persistida imediatamente no OracleRPG.",
      inputSchema: z.object({
        pairCode,
        resource: z.enum(["hp", "hope", "stress", "armor"]),
        amount: z.number().int().describe("Variação relativa. Use negativo para gastar/perder e positivo para recuperar."),
      }),
    },
    async ({ pairCode, resource, amount }) => {
      try {
        const result = await mutateCampaign(parsePairCode(pairCode), (state) =>
          executeCommand(state, { type: "adjust", resource, amount }, "gm-ai"),
        );
        return text({ ok: true, version: result.version, character: result.state.character });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "adjust_inventory",
    {
      title: "Alterar inventário",
      description: "Adicione ou remova quantidade de um item que já existe no inventário da campanha. Leia a campanha antes para obter o itemId correto.",
      inputSchema: z.object({
        pairCode,
        itemId: z.string().min(1),
        amount: z.number().int(),
      }),
    },
    async ({ pairCode, itemId, amount }) => {
      try {
        const result = await mutateCampaign(parsePairCode(pairCode), (state) =>
          executeCommand(state, { type: "inventory", itemId, amount }, "gm-ai"),
        );
        return text({ ok: true, version: result.version, inventory: result.state.inventory });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "set_quest_status",
    {
      title: "Atualizar missão",
      description: "Marque uma missão existente como ativa ou concluída. Leia a campanha antes para obter o questId correto.",
      inputSchema: z.object({
        pairCode,
        questId: z.string().min(1),
        status: z.enum(["active", "completed"]),
      }),
    },
    async ({ pairCode, questId, status }) => {
      try {
        const result = await mutateCampaign(parsePairCode(pairCode), (state) =>
          executeCommand(state, { type: "quest", questId, status }, "gm-ai"),
        );
        return text({ ok: true, version: result.version, quests: result.state.quests });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "set_condition",
    {
      title: "Atualizar condição",
      description: "Aplique ou remova uma condição do personagem ativo e persista a mudança na ficha OracleRPG.",
      inputSchema: z.object({
        pairCode,
        name: z.string().min(1),
        active: z.boolean(),
      }),
    },
    async ({ pairCode, name, active }) => {
      try {
        const result = await mutateCampaign(parsePairCode(pairCode), (state) =>
          executeCommand(state, { type: "condition", name, active }, "gm-ai"),
        );
        return text({ ok: true, version: result.version, conditions: result.state.character.conditions });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "search_campaign_memory",
    {
      title: "Pesquisar memória da campanha",
      description: "Pesquise fatos, eventos, segredos e descrições visuais persistentes antes de recuperar lore antigo ou características de personagens.",
      inputSchema: z.object({
        pairCode,
        query: z.string().min(1),
        limit: z.number().int().min(1).max(20).default(8),
      }),
    },
    async ({ pairCode, query, limit }) => {
      try {
        const campaign = await readCampaign(parsePairCode(pairCode));
        const terms = query.toLocaleLowerCase("pt-BR").split(/\s+/).filter(Boolean);
        const memories = campaign.state.memories
          .map((memory) => ({
            ...memory,
            score: terms.reduce(
              (score, term) => score + (memory.text.toLocaleLowerCase("pt-BR").includes(term) ? 1 : 0),
              0,
            ),
          }))
          .filter((memory) => memory.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map(({ score: _score, ...memory }) => memory);
        return text({ query, memories });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "record_campaign_memory",
    {
      title: "Registrar memória da campanha",
      description: "Persista um fato, evento, segredo ou característica visual que deva sobreviver ao contexto da conversa. Não registre detalhes triviais ou temporários.",
      inputSchema: z.object({
        pairCode,
        kind: z.enum(["fact", "event", "secret", "visual"]),
        memory: z.string().min(1).max(2000),
      }),
    },
    async ({ pairCode, kind, memory }) => {
      try {
        const result = await mutateCampaign(parsePairCode(pairCode), (state) =>
          executeCommand(state, { type: "memory", kind, text: memory }, "gm-ai"),
        );
        return text({ ok: true, version: result.version, memory: result.state.memories[0] });
      } catch (error) {
        return failure(error);
      }
    },
  );
}, {
  serverInfo: {
    name: "oraclerpg",
    version: "0.1.0",
  },
});

export { handler as GET, handler as POST };
