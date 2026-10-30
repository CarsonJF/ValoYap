import { EventEmitter } from "node:events";
import type { AgentDetection, DetectionState } from "@valoyap/shared";
import { parseLogLine } from "./logParser";
import { DetectionMachine, type MachineEvent } from "./stateMachine";
import type { Resolved } from "./agentResolver";

export type ResolveFn = (
  state: DetectionState,
  glzBase: string,
  isStale: () => boolean,
) => Promise<Resolved | null>;

export interface DetectionServiceOptions {
  resolve: ResolveFn;
  /** Debounce for select/lock log triggers. */
  debounceMs?: number;
  source?: AgentDetection["source"];
}

/**
 * Glue: log lines -> state machine -> (on transition only) one resolve call.
 * Works identically for the live log tailer and for replayed sample lines.
 */
export class DetectionService extends EventEmitter {
  readonly machine: DetectionMachine;
  private detection: AgentDetection = {
    state: "OFFLINE",
    agentId: null,
    selection: "none",
    source: "log+api",
    updatedAt: Date.now(),
  };
  private generation = 0;
  private debounce: NodeJS.Timeout | null = null;

  constructor(private opts: DetectionServiceOptions) {
    super();
    if (opts.source) this.detection.source = opts.source;
    this.machine = new DetectionMachine((e) => this.onMachine(e));
  }

  get current(): AgentDetection {
    return this.detection;
  }

  feedLine(line: string): void {
    this.machine.feed(parseLogLine(line));
  }

  setGameRunning(running: boolean): void {
    this.machine.setGameRunning(running);
  }

  private set(patch: Partial<AgentDetection>): void {
    const next = { ...this.detection, ...patch, updatedAt: Date.now() };
    const changed =
      next.state !== this.detection.state ||
      next.agentId !== this.detection.agentId ||
      next.selection !== this.detection.selection;
    this.detection = next;
    if (changed) this.emit("detection", next);
  }

  private onMachine(e: MachineEvent): void {
    if (e.type === "state") {
      this.generation++;
      if (e.to === "AGENT_SELECT" || e.to === "IN_MATCH") {
        // keep last agent through AGENT_SELECT -> IN_MATCH to avoid a flicker
        this.set({ state: e.to });
        this.refresh();
      } else {
        this.set({ state: e.to, agentId: null, selection: "none" });
      }
    } else if (e.type === "agentAction") {
      if (this.detection.state === "AGENT_SELECT") this.refreshSoon();
    } else if (e.type === "context") {
      const s = this.detection.state;
      if ((s === "AGENT_SELECT" || s === "IN_MATCH") && !this.detection.agentId) this.refreshSoon();
    }
  }

  private refreshSoon(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.refresh(), this.opts.debounceMs ?? 300);
  }

  private async refresh(): Promise<void> {
    const { state, glzBase } = { state: this.detection.state, glzBase: this.machine.snapshot.glzBase };
    if (!glzBase || (state !== "AGENT_SELECT" && state !== "IN_MATCH")) return;
    const gen = this.generation;
    try {
      const r = await this.opts.resolve(state, glzBase, () => gen !== this.generation);
      if (r && gen === this.generation) this.set({ agentId: r.agentId, selection: r.selection });
    } catch (err) {
      this.emit("error", err);
    }
  }
}
