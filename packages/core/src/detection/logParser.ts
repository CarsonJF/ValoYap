/**
 * Parses single lines of ShooterGame.log. Pure, no I/O.
 *
 * Real lines this was written against (VALORANT 13.x):
 *   LogGameFlowStateManager: [PlatformTime: 345292.3] Transitioning from TransitionToMainMenu to MainMenu
 *   LogPlatformCommon: Platform HTTP Query End. QueryName: [Pregame_GetPlayer], URL [GET https://glz-na-1.na.a.pvp.net/pregame/v1/players/<puuid>], ...
 */
export type LogEvent =
  | { kind: "gameflow"; from: string; to: string }
  | { kind: "glz"; baseUrl: string; region: string; shard: string }
  | { kind: "puuid"; puuid: string }
  | { kind: "agentAction"; action: "select" | "lock" };

const FLOW = /LogGameFlowStateManager:.*Transitioning from (\w+) to (\w+)/;
const GLZ = /https:\/\/glz-([a-z0-9]+)-\d+\.([a-z0-9]+)\.a\.pvp\.net/i;
const PUUID_URL = /\/(?:players|sessions)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const QUERY = /QueryName: \[(Pregame_[A-Za-z]+)\]/;

export function parseLogLine(line: string): LogEvent[] {
  const out: LogEvent[] = [];
  const flow = FLOW.exec(line);
  if (flow) out.push({ kind: "gameflow", from: flow[1], to: flow[2] });

  if (line.includes("Platform HTTP Query End")) {
    const g = GLZ.exec(line);
    if (g) {
      out.push({ kind: "glz", baseUrl: g[0], region: g[1], shard: g[2] });
      const p = PUUID_URL.exec(line);
      if (p && /\/(players)\//.test(line)) out.push({ kind: "puuid", puuid: p[1].toLowerCase() });
    }
    const q = QUERY.exec(line);
    if (q) {
      if (q[1] === "Pregame_SelectCharacter") out.push({ kind: "agentAction", action: "select" });
      else if (q[1] === "Pregame_LockCharacter") out.push({ kind: "agentAction", action: "lock" });
    }
  }
  return out;
}
