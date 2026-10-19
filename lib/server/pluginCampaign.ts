import type { GameState, Memory } from "@/lib/game";
import { executeCommand } from "@/lib/game";
import { db } from "@/lib/server/db";
import { sha256 } from "@/lib/server/crypto";

export type CampaignCredential = {
  campaignId: string;
  syncKey: string;
};

export function parseCampaignCredential(token: string): CampaignCredential | null {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const campaignId = token.slice(0, dot).trim();
  const syncKey = token.slice(dot + 1).trim();
  if (!campaignId || !syncKey) return null;
  return { campaignId, syncKey };
}

export async function loadCampaignByToken(token: string) {
  const credential = parseCampaignCredential(token);
  if (!credential) return null;
  const sql = db();
  try {
    const rows = await sql`
      SELECT id, state, version, updated_at
      FROM campaigns
      WHERE id = ${credential.campaignId}::uuid
        AND secret_hash = ${sha256(credential.syncKey)}
      LIMIT 1
    `;
    if (!rows[0]) return null;
    return {
      id: String(rows[0].id),
      state: rows[0].state as GameState,
      version: Number(rows[0].version),
      updatedAt: rows[0].updated_at,
    };
  } catch {
    return null;
  }
}

export async function mutateCampaignByToken(
  token: string,
  mutate: (state: GameState) => GameState,
) {
  const credential = parseCampaignCredential(token);
  if (!credential) throw new Error("Invalid campaign credential.");

  const sql = db();
  const secretHash = sha256(credential.syncKey);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rows = await sql`
      SELECT state, version
      FROM campaigns
      WHERE id = ${credential.campaignId}::uuid
        AND secret_hash = ${secretHash}
      LIMIT 1
    `;
    if (!rows[0]) throw new Error("Campaign not found.");

    const current = rows[0].state as GameState;
    const version = Number(rows[0].version);
    const next = mutate(structuredClone(current) as GameState);
    const updated = await sql`
      UPDATE campaigns
      SET state = ${JSON.stringify(next)}::jsonb,
          version = version + 1,
          updated_at = now()
      WHERE id = ${credential.campaignId}::uuid
        AND secret_hash = ${secretHash}
        AND version = ${version}
      RETURNING version, updated_at
    `;
    if (updated[0]) {
      return {
        id: credential.campaignId,
        state: next,
        version: Number(updated[0].version),
        updatedAt: updated[0].updated_at,
      };
    }
  }

  throw new Error("Campaign changed concurrently. Retry the action.");
}

export function applyOracleTool(
  state: GameState,
  tool:
    | { type: "adjust"; resource: "hp" | "hope" | "stress" | "armor"; amount: number }
    | { type: "inventory"; itemId: string; amount: number }
    | { type: "quest"; questId: string; status: "active" | "completed" }
    | { type: "condition"; name: string; active: boolean }
    | { type: "memory"; kind: Memory["kind"]; text: string },
) {
  return executeCommand(state, tool, "gm-ai");
}
