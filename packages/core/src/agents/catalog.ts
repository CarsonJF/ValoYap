import fs from "node:fs";
import path from "node:path";
import type { AgentInfo } from "@valoyap/shared";

export const CACHE_SCHEME = "valoyap-cache";
const API = "https://valorant-api.com/v1/agents?isPlayableCharacter=true";

interface ApiAgent {
  uuid: string;
  displayName: string;
  role?: { displayName: string } | null;
  displayIcon?: string | null;
  fullPortrait?: string | null;
  bustPortrait?: string | null;
}

/** Normalize the public API payload. Pure, tested. */
export function parseAgents(json: any): ApiAgent[] {
  const data: ApiAgent[] = Array.isArray(json?.data) ? json.data : [];
  return data.filter((a) => a.uuid && a.displayName).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

async function download(url: string, dest: string): Promise<boolean> {
  if (fs.existsSync(dest)) return true;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads the agent list + art from valorant-api.com into the gitignored runtime cache.
 * Falls back to the cached JSON offline. Art is never bundled with the app or repo.
 */
export async function loadAgents(cacheDir: string, onProgress?: (agents: AgentInfo[]) => void): Promise<AgentInfo[]> {
  const jsonFile = path.join(cacheDir, "agents.json");
  let json: any = null;
  try {
    const res = await fetch(API);
    if (res.ok) {
      json = await res.json();
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(jsonFile, JSON.stringify(json));
    }
  } catch {
    /* offline */
  }
  if (!json) {
    try {
      json = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
    } catch {
      return [];
    }
  }
  const api = parseAgents(json);
  const build = (): AgentInfo[] =>
    api.map((a) => {
      const dir = path.join(cacheDir, "agents", a.uuid);
      const icon = path.join(dir, "icon.png");
      const portrait = path.join(dir, "portrait.png");
      return {
        uuid: a.uuid.toLowerCase(),
        name: a.displayName,
        role: a.role?.displayName ?? "",
        iconUrl: fs.existsSync(icon) ? `${CACHE_SCHEME}://agents/${a.uuid}/icon.png` : undefined,
        portraitUrl: fs.existsSync(portrait) ? `${CACHE_SCHEME}://agents/${a.uuid}/portrait.png` : undefined,
      };
    });
  onProgress?.(build());
  // Fetch art in the background with small concurrency, then re-publish.
  const jobs: Array<() => Promise<boolean>> = [];
  for (const a of api) {
    const dir = path.join(cacheDir, "agents", a.uuid);
    if (a.displayIcon) jobs.push(() => download(a.displayIcon!, path.join(dir, "icon.png")));
    const p = a.fullPortrait ?? a.bustPortrait;
    if (p) jobs.push(() => download(p, path.join(dir, "portrait.png")));
  }
  for (let i = 0; i < jobs.length; i += 6) await Promise.all(jobs.slice(i, i + 6).map((j) => j()));
  const done = build();
  onProgress?.(done);
  return done;
}
