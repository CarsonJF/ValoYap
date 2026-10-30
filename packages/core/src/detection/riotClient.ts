import fs from "node:fs";
import path from "node:path";
import { getJson } from "./http";

export interface Lockfile {
  port: number;
  password: string;
}

export function parseLockfile(content: string): Lockfile | null {
  // name:pid:port:password:protocol
  const parts = content.trim().split(":");
  if (parts.length < 5) return null;
  const port = Number(parts[2]);
  if (!Number.isInteger(port) || port <= 0) return null;
  return { port, password: parts[3] };
}

export function lockfilePath(localAppData = process.env.LOCALAPPDATA ?? ""): string {
  return path.join(localAppData, "Riot Games", "Riot Client", "Config", "lockfile");
}

export interface RiotAuth {
  accessToken: string;
  entitlementsToken: string;
  puuid: string;
}

const PLATFORM = Buffer.from(
  JSON.stringify({
    platformType: "PC",
    platformOS: "Windows",
    platformOSVersion: "10.0.19042.1.256.64bit",
    platformChipset: "Unknown",
  }),
).toString("base64");

/** Read-only access to the local Riot Client + remote GLZ. GET only. */
export class RiotClient {
  private clientVersion: string | null = null;

  constructor(private lockfile: string = lockfilePath()) {}

  async getAuth(): Promise<RiotAuth> {
    const lock = parseLockfile(fs.readFileSync(this.lockfile, "utf8"));
    if (!lock) throw new Error("Riot Client lockfile is malformed");
    const basic = Buffer.from(`riot:${lock.password}`).toString("base64");
    const r = await getJson<{ accessToken: string; token: string; subject: string }>(
      `https://127.0.0.1:${lock.port}/entitlements/v1/token`,
      { Authorization: `Basic ${basic}` },
      { insecureLocal: true },
    );
    return { accessToken: r.accessToken, entitlementsToken: r.token, puuid: r.subject };
  }

  async getClientVersion(): Promise<string> {
    if (this.clientVersion) return this.clientVersion;
    const r = await getJson<{ data: { riotClientVersion: string } }>("https://valorant-api.com/v1/version");
    this.clientVersion = r.data.riotClientVersion;
    return this.clientVersion;
  }

  async glzGet<T = any>(glzBase: string, urlPath: string, auth: RiotAuth): Promise<T> {
    return getJson<T>(`${glzBase}${urlPath}`, {
      Authorization: `Bearer ${auth.accessToken}`,
      "X-Riot-Entitlements-JWT": auth.entitlementsToken,
      "X-Riot-ClientPlatform": PLATFORM,
      "X-Riot-ClientVersion": await this.getClientVersion(),
    });
  }
}
