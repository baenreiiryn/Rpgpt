import { db } from "@/lib/server/db";
import { sha256 } from "@/lib/server/crypto";
import type { GameState } from "@/lib/game";

export type CampaignAccess = {
  id: string;
  key: string;
};

export function parsePairCode(pairCode: string): CampaignAccess {
  const value = pairCode.trim();
  const separator = value.indexOf(".");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error("Código de pareamento inválido.");
  }
  return { id: value.slice(0, separator), key: value.slice(separator + 1) };
}

export async function readCampaign(access: CampaignAccess) {
  const sql = db();
  try {
    const rows = await sql`
      SELECT id, state, version, updated_at
      FROM campaigns
      WHERE id = ${access.id}::uuid
        AND secret_hash = ${sha256(access.key)}
      LIMIT 1
    `;
    if (!rows[0]) throw new Error("Campanha não encontrada ou código de pareamento incorreto.");
    return {
      id: String(rows[0].id),
      state: rows[0].state as GameState,
      version: Number(rows[0].version),
      updatedAt: rows[0].updated_at,
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Campanha não encontrada")) throw error;
    throw new Error("Código de pareamento inválido.");
  }
}

export async function mutateCampaign(
  access: CampaignAccess,
  mutate: (state: GameState) => GameState,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readCampaign(access);
    const next = mutate(structuredClone(current.state) as GameState);
    const sql = db();
    const rows = await sql`
      UPDATE campaigns
      SET state = ${JSON.stringify(next)}::jsonb,
          version = version + 1,
          updated_at = now()
      WHERE id = ${access.id}::uuid
        AND secret_hash = ${sha256(access.key)}
        AND version = ${current.version}
      RETURNING version, updated_at
    `;
    if (rows[0]) {
      return {
        id: access.id,
        state: next,
        version: Number(rows[0].version),
        updatedAt: rows[0].updated_at,
      };
    }
  }
  throw new Error("A campanha mudou ao mesmo tempo. Tente a ação novamente.");
}
