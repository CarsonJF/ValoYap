export type DetectionState = "OFFLINE" | "MENU" | "AGENT_SELECT" | "IN_MATCH";

export interface AgentInfo {
  uuid: string;
  name: string;
  role: string;
  /** URL (file:// or data:) of the locally cached icon. Undefined until downloaded. */
  iconUrl?: string;
  portraitUrl?: string;
}

export interface AgentDetection {
  state: DetectionState;
  agentId: string | null;
  /** "selected" = hovering in agent select, "locked" = locked in / in match. */
  selection: "none" | "selected" | "locked";
  source: "log+api" | "manual" | "mock";
  updatedAt: number;
}

export type ClipSource = "voiceline" | "user";

export interface Clip {
  /** Stable id: `voiceline:{agentKey}/{file}` or `user:{agentKey}/{file}`. */
  id: string;
  /** Agent uuid (lowercase) or "shared". */
  agentKey: string;
  source: ClipSource;
  /** Absolute path on disk. */
  path: string;
  /** File-name derived title (no extension). */
  defaultTitle: string;
}

export interface ResolvedClip extends Clip {
  title: string;
  enabled: boolean;
  /** 0..1 multiplier on top of the global volume. */
  volume: number;
  /** 1-based key number within the current list (enabled only), 0 if disabled. */
  key: number;
}

export interface PlaybackState {
  clipId: string | null;
  startedAt: number | null;
  durationMs: number | null;
  phase: "idle" | "preroll" | "playing" | "tail";
  /** Set when a request was rejected (cooldown etc.). */
  lastRejected?: { clipId: string; reason: "cooldown" | "busy" | "missing" };
}

/** Everything the renderer needs, pushed from the main process on every change. */
export interface AppState {
  agents: AgentInfo[];
  detection: AgentDetection;
  /** manual pick if set, otherwise the detected agent */
  effectiveAgentId: string | null;
  config: import("./config").Config;
  /** Combined ordered list (voice lines + user clips + shared) for the effective agent. Includes disabled. */
  clips: ResolvedClip[];
  playback: PlaybackState;
  sdClients: number;
  unknownFolders: string[];
  paths: { voicelines: string; clips: string; cache: string; config: string };
  /** folder name to drop files into for the effective agent */
  agentFolder: string;
  mode: "live" | "replay" | "mock";
  lastError: string | null;
}
