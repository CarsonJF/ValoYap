import { BrowserWindow, ipcMain } from "electron";
import type { AudioEngine } from "@valoyap/core";
import type { ResolvedClip } from "@valoyap/shared";
import { mediaUrl } from "./media";

/**
 * Audio plays in the renderer (Chromium's <audio> + setSinkId targets a specific output device,
 * which Node alone cannot do). This bridges the PlaybackController to it over IPC.
 */
export class RendererAudioEngine implements AudioEngine {
  private seq = 0;
  private pending = new Map<number, { resolve: () => void; reject: (e: Error) => void; onStart: (d: number) => void }>();

  constructor(private getWindow: () => BrowserWindow | null, private getDevice: () => string | null) {
    ipcMain.on("audio:started", (_e, id: number, durationMs: number) => this.pending.get(id)?.onStart(durationMs));
    ipcMain.on("audio:ended", (_e, id: number, error?: string) => {
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      error ? p.reject(new Error(error)) : p.resolve();
    });
  }

  play(clip: ResolvedClip, gain: number, onStart: (durationMs: number) => void): Promise<void> {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return Promise.reject(new Error("No window to play audio in"));
    const id = ++this.seq;
    return new Promise<void>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onStart });
      win.webContents.send("audio:play", { id, url: mediaUrl(clip.path), gain, deviceId: this.getDevice() });
    });
  }

  stop(): void {
    const win = this.getWindow();
    win?.webContents.send("audio:stop");
    for (const [id, p] of this.pending) {
      this.pending.delete(id);
      p.resolve();
    }
  }
}
