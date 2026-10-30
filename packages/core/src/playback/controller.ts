import { EventEmitter } from "node:events";
import type { Config, PlaybackState, ResolvedClip } from "@valoyap/shared";
import type { KeyInjector } from "../ptt/injector";

export interface AudioEngine {
  /**
   * Start playing; resolves when playback ends (or is stopped).
   * `onStart` is called once audio has actually begun, with the clip duration.
   */
  play(clip: ResolvedClip, gain: number, onStart: (durationMs: number) => void): Promise<void>;
  stop(): void;
}

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}
const realClock: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/** A clip can never hold PTT longer than this, even if the audio engine hangs. */
export const MAX_CLIP_MS = 60_000;

export type PlayResult = "ok" | "cooldown" | "busy" | "error";

/** Final gain: global volume * clip volume, hard-capped (voice-abuse safety). */
export function computeGain(cfg: Config["audio"], clipVolume: number): number {
  return Math.max(0, Math.min(cfg.volume * clipVolume, cfg.volumeCap));
}

/**
 * Orchestrates one clip at a time: cooldown -> PTT down -> pre-roll -> audio -> tail -> PTT up.
 * PTT is always released in `finally`, on stop(), and on dispose().
 */
export class PlaybackController extends EventEmitter {
  private state: PlaybackState = { clipId: null, startedAt: null, durationMs: null, phase: "idle" };
  private lastPlayed = new Map<string, number>();
  private pttHeld: { code: string; method: "scancode" | "vk" } | null = null;
  private stopped = false;

  constructor(
    private audio: AudioEngine,
    private injector: KeyInjector,
    private getConfig: () => Config,
    private clock: Clock = realClock,
  ) {
    super();
  }

  get current(): PlaybackState {
    return this.state;
  }

  private set(patch: Partial<PlaybackState>): void {
    this.state = { ...this.state, ...patch };
    this.emit("state", this.state);
  }

  private reject(clipId: string, reason: "cooldown" | "busy"): PlayResult {
    this.set({ lastRejected: { clipId, reason } });
    return reason;
  }

  async play(clip: ResolvedClip): Promise<PlayResult> {
    const cfg = this.getConfig();
    if (this.state.phase !== "idle") return this.reject(clip.id, "busy");
    const last = this.lastPlayed.get(clip.id);
    if (last !== undefined && this.clock.now() - last < cfg.audio.cooldownMs) return this.reject(clip.id, "cooldown");

    this.stopped = false;
    this.lastPlayed.set(clip.id, this.clock.now());
    const useSynthetic = cfg.ptt.enabled && cfg.ptt.mode === "synthetic" && cfg.ptt.key;
    let result: PlayResult = "ok";
    const watchdog = setTimeout(() => this.audio.stop(), MAX_CLIP_MS);
    try {
      this.set({ clipId: clip.id, startedAt: null, durationMs: null, phase: "preroll", lastRejected: undefined });
      if (useSynthetic) {
        this.pttDown(cfg.ptt.key!.code, cfg.ptt.inputMethod);
        await this.clock.sleep(cfg.ptt.preRollMs);
      }
      if (this.stopped) return "ok";
      await this.audio.play(clip, computeGain(cfg.audio, clip.volume), (durationMs) =>
        this.set({ phase: "playing", startedAt: this.clock.now(), durationMs }),
      );
      this.set({ phase: "tail" });
      if (useSynthetic && !this.stopped) await this.clock.sleep(cfg.ptt.tailMs);
    } catch (e) {
      result = "error";
      this.emit("error", e);
    } finally {
      clearTimeout(watchdog);
      this.pttUp();
      this.set({ clipId: null, startedAt: null, durationMs: null, phase: "idle" });
    }
    return result;
  }

  stop(): void {
    this.stopped = true;
    this.audio.stop();
    this.pttUp();
  }

  dispose(): void {
    this.stop();
  }

  private pttDown(code: string, method: "scancode" | "vk"): void {
    this.injector.down(code, method);
    this.pttHeld = { code, method };
  }

  private pttUp(): void {
    if (!this.pttHeld) return;
    const h = this.pttHeld;
    this.pttHeld = null;
    try {
      this.injector.up(h.code, h.method);
    } catch (e) {
      this.emit("error", e);
    }
  }
}
