import type { AgentDetection, DetectionState, PlaybackState } from "./types";

/** Desktop app -> Stream Deck plugin */
export interface SdSlot {
  clipId: string;
  /** 1-based key number */
  key: number;
  title: string;
}
export interface SdStateMessage {
  type: "state";
  detection: AgentDetection;
  agent: { id: string | null; name: string; role: string; iconDataUrl?: string };
  slots: SdSlot[];
  playback: PlaybackState;
  pttMode: "synthetic" | "external";
}
export type SdServerMessage = SdStateMessage;

/** Stream Deck plugin -> desktop app */
export type SdCommand =
  | { type: "hello"; version: string }
  | { type: "play"; clipId: string }
  | { type: "stop" }
  | { type: "manualAgent"; agentId: string | null };

export const DETECTION_LABEL: Record<DetectionState, string> = {
  OFFLINE: "GAME NOT RUNNING",
  MENU: "MENU",
  AGENT_SELECT: "AGENT SELECT",
  IN_MATCH: "IN MATCH",
};
