import { contextBridge, ipcRenderer } from "electron";
import type { AppState } from "@valoyap/shared";

const api = {
  getState: (): Promise<AppState> => ipcRenderer.invoke("state:get"),
  onState: (cb: (s: AppState) => void) => {
    const h = (_: unknown, s: AppState) => cb(s);
    ipcRenderer.on("state:update", h);
    return (): void => void ipcRenderer.removeListener("state:update", h);
  },
  play: (clipId: string): Promise<string> => ipcRenderer.invoke("clip:play", clipId),
  stop: (): Promise<void> => ipcRenderer.invoke("clip:stop"),
  setManualAgent: (id: string | null): Promise<void> => ipcRenderer.invoke("agent:manual", id),
  patchConfig: (patch: unknown): Promise<void> => ipcRenderer.invoke("config:patch", patch),
  setClip: (clipId: string, o: { title?: string; enabled?: boolean; volume?: number }): Promise<void> =>
    ipcRenderer.invoke("clip:set", clipId, o),
  moveClip: (clipId: string, dir: -1 | 1): Promise<void> => ipcRenderer.invoke("clip:move", clipId, dir),
  addFiles: (source: "voiceline" | "user"): Promise<number> => ipcRenderer.invoke("clip:add", source),
  importFolder: (): Promise<number> => ipcRenderer.invoke("clip:import-folder"),
  openFolder: (kind: "voicelines" | "clips" | "cache" | "config"): Promise<void> => ipcRenderer.invoke("open:folder", kind),
  rescan: (): Promise<void> => ipcRenderer.invoke("clips:rescan"),
  pttTest: (): Promise<string> => ipcRenderer.invoke("ptt:test"),
  // audio bridge (main -> renderer commands, renderer -> main reports)
  onAudioPlay: (cb: (p: { id: number; url: string; gain: number; deviceId: string | null }) => void) => {
    const h = (_: unknown, p: any) => cb(p);
    ipcRenderer.on("audio:play", h);
    return (): void => void ipcRenderer.removeListener("audio:play", h);
  },
  onAudioStop: (cb: () => void) => {
    ipcRenderer.on("audio:stop", cb);
    return (): void => void ipcRenderer.removeListener("audio:stop", cb);
  },
  audioStarted: (id: number, durationMs: number) => ipcRenderer.send("audio:started", id, durationMs),
  audioEnded: (id: number, error?: string) => ipcRenderer.send("audio:ended", id, error),
};

contextBridge.exposeInMainWorld("valoyap", api);
export type ValoYapApi = typeof api;
