import type { DetectionState } from "@valoyap/shared";
import type { LogEvent } from "./logParser";

/** Maps a raw GameFlow state name to our coarse state; null = ignore (unknown). */
export function mapFlowState(name: string): DetectionState | null {
  const n = name.toLowerCase();
  if (n === "initialization" || n.includes("mainmenu")) return "MENU";
  if (n.includes("pregame")) return "AGENT_SELECT";
  if (n.includes("ingame") || n.includes("coregame")) return "IN_MATCH";
  return null;
}

export interface MachineSnapshot {
  state: DetectionState;
  glzBase: string | null;
  puuid: string | null;
}

export type MachineEvent =
  | { type: "state"; from: DetectionState; to: DetectionState }
  | { type: "agentAction"; action: "select" | "lock" }
  | { type: "context" };

/**
 * Turns log events + process liveness into a detection state.
 * Fires "state" on real transitions only, so the API is queried only then.
 */
export class DetectionMachine {
  private snap: MachineSnapshot = { state: "OFFLINE", glzBase: null, puuid: null };
  private running = false;
  constructor(private emit: (e: MachineEvent) => void = () => {}) {}

  get snapshot(): MachineSnapshot {
    return { ...this.snap };
  }

  /** Called when the game process starts/stops. */
  setGameRunning(running: boolean): void {
    if (running === this.running) return;
    this.running = running;
    if (!running) {
      this.snap.glzBase = null;
      this.set("OFFLINE");
    } else if (this.snap.state === "OFFLINE") {
      this.set("MENU");
    }
  }

  feed(events: LogEvent[]): void {
    for (const e of events) {
      switch (e.kind) {
        case "gameflow": {
          const to = mapFlowState(e.to);
          if (to) this.set(to);
          break;
        }
        case "glz":
          if (this.snap.glzBase !== e.baseUrl) {
            this.snap.glzBase = e.baseUrl;
            this.emit({ type: "context" });
          }
          break;
        case "puuid":
          if (this.snap.puuid !== e.puuid) {
            this.snap.puuid = e.puuid;
            this.emit({ type: "context" });
          }
          break;
        case "agentAction":
          this.emit({ type: "agentAction", action: e.action });
          break;
      }
    }
  }

  private set(to: DetectionState): void {
    const from = this.snap.state;
    if (from === to) return;
    this.snap.state = to;
    this.emit({ type: "state", from, to });
  }
}
