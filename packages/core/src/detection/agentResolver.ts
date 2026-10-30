import type { DetectionState } from "@valoyap/shared";
import { HttpError } from "./http";
import type { RiotAuth } from "./riotClient";

/** Narrow interface so the resolver is testable without the network. */
export interface GlzReader {
  getAuth(): Promise<RiotAuth>;
  glzGet<T = any>(glzBase: string, urlPath: string, auth: RiotAuth): Promise<T>;
}

export interface Resolved {
  agentId: string | null;
  selection: "none" | "selected" | "locked";
}

const lc = (s: unknown) => (typeof s === "string" && s ? s.toLowerCase() : null);

/** Extract my CharacterID from a pregame match payload. */
export function pickPregameAgent(match: any, puuid: string): Resolved {
  const players: any[] = match?.AllyTeam?.Players ?? [];
  const me = players.find((p) => lc(p.Subject) === puuid.toLowerCase());
  const id = lc(me?.CharacterID);
  if (!id) return { agentId: null, selection: "none" };
  return { agentId: id, selection: me.CharacterSelectionState === "locked" ? "locked" : "selected" };
}

/** Extract my CharacterID from a core-game match payload. */
export function pickCoreGameAgent(match: any, puuid: string): Resolved {
  const players: any[] = match?.Players ?? [];
  const me = players.find((p) => lc(p.Subject) === puuid.toLowerCase());
  const id = lc(me?.CharacterID);
  return id ? { agentId: id, selection: "locked" } : { agentId: null, selection: "none" };
}

/**
 * One-shot lookups against the remote GLZ API. Read-only GETs.
 * Throws HttpError(404) when no match exists yet (caller may retry a bounded number of times).
 */
export async function resolveAgentOnce(
  reader: GlzReader,
  state: DetectionState,
  glzBase: string,
): Promise<Resolved> {
  const auth = await reader.getAuth();
  if (state === "AGENT_SELECT") {
    const player = await reader.glzGet<{ MatchID: string }>(glzBase, `/pregame/v1/players/${auth.puuid}`, auth);
    const match = await reader.glzGet(glzBase, `/pregame/v1/matches/${player.MatchID}`, auth);
    return pickPregameAgent(match, auth.puuid);
  }
  if (state === "IN_MATCH") {
    const player = await reader.glzGet<{ MatchID: string }>(glzBase, `/core-game/v1/players/${auth.puuid}`, auth);
    const match = await reader.glzGet(glzBase, `/core-game/v1/matches/${player.MatchID}`, auth);
    return pickCoreGameAgent(match, auth.puuid);
  }
  return { agentId: null, selection: "none" };
}

/** Bounded retry for the short window where the match does not exist yet. No tight loop. */
export async function resolveAgentWithRetry(
  reader: GlzReader,
  state: DetectionState,
  glzBase: string,
  opts: { delaysMs?: number[]; sleep?: (ms: number) => Promise<void>; isStale?: () => boolean } = {},
): Promise<Resolved | null> {
  const delays = opts.delaysMs ?? [0, 1000, 2000, 3000, 5000];
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  let last: unknown;
  for (const d of delays) {
    if (d) await sleep(d);
    if (opts.isStale?.()) return null;
    try {
      return await resolveAgentOnce(reader, state, glzBase);
    } catch (e) {
      last = e;
      const retryable = e instanceof HttpError ? e.status === 404 || e.status === 400 : false;
      if (!retryable && !(e instanceof Error && /ENOENT|ECONNREFUSED/.test(e.message))) break;
    }
  }
  throw last;
}
