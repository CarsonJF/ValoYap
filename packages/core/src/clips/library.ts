import fs from "node:fs";
import path from "node:path";
import type { AgentInfo, Clip, ClipSource } from "@valoyap/shared";

/** Formats Chromium's <audio> can decode. (.wem/.bnk Wwise files must be converted first.) */
export const AUDIO_EXTS = new Set([".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aac", ".opus", ".webm"]);

import { SHARED, normalizeName } from "@valoyap/shared";
export { SHARED, normalizeName, resolveClips, reorder } from "@valoyap/shared";

/** Folder name -> agent key (uuid | "shared"). Accepts agent name ("KAY/O"->"kayo") or uuid. */
export function folderToAgentKey(folder: string, agents: AgentInfo[]): string | null {
  const n = normalizeName(folder);
  if (n === SHARED) return SHARED;
  const hit = agents.find((a) => normalizeName(a.name) === n || a.uuid.toLowerCase() === folder.toLowerCase());
  return hit ? hit.uuid.toLowerCase() : null;
}

export function agentKeyToFolder(key: string, agents: AgentInfo[]): string {
  if (key === SHARED) return SHARED;
  return agents.find((a) => a.uuid.toLowerCase() === key)?.name.replace(/[\\/:*?"<>|]/g, "-") ?? key;
}

export interface ScanResult {
  clips: Clip[];
  /** top-level folders that did not map to any agent */
  unknownFolders: string[];
}

export function scanDir(root: string, source: ClipSource, agents: AgentInfo[]): ScanResult {
  const clips: Clip[] = [];
  const unknownFolders: string[] = [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return { clips, unknownFolders };
  }
  for (const d of entries) {
    if (!d.isDirectory()) continue;
    const key = folderToAgentKey(d.name, agents);
    if (!key) {
      unknownFolders.push(d.name);
      continue;
    }
    for (const f of fs.readdirSync(path.join(root, d.name), { withFileTypes: true })) {
      if (!f.isFile()) continue;
      const ext = path.extname(f.name).toLowerCase();
      if (!AUDIO_EXTS.has(ext)) continue;
      clips.push({
        id: `${source}:${key}/${f.name}`,
        agentKey: key,
        source,
        path: path.join(root, d.name, f.name),
        defaultTitle: path.basename(f.name, path.extname(f.name)).replace(/[_]+/g, " "),
      });
    }
  }
  return { clips, unknownFolders };
}

