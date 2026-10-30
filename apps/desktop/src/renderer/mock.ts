/**
 * Browser/screenshot mock of the preload API. Uses invented placeholder clips and NO Riot art:
 * agents only need a name + role (plain facts); portraits/icons fall back to a monogram.
 */
import { defaultConfig, resolveClips as resolveClipsLite, type AppState, type Clip, type AgentInfo } from "@valoyap/shared";
import type { ValoYapApi } from "../preload";

const A = (name: string, role: string): AgentInfo => ({ uuid: name.toLowerCase().replace(/[^a-z]/g, ""), name, role });
const AGENTS: AgentInfo[] = [
  A("Astra", "Controller"), A("Breach", "Initiator"), A("Brimstone", "Controller"), A("Chamber", "Sentinel"),
  A("Clove", "Controller"), A("Cypher", "Sentinel"), A("Deadlock", "Sentinel"), A("Fade", "Initiator"),
  A("Gekko", "Initiator"), A("Harbor", "Controller"), A("Iso", "Duelist"), A("Jett", "Duelist"),
  A("KAY/O", "Initiator"), A("Killjoy", "Sentinel"), A("Neon", "Duelist"), A("Omen", "Controller"),
  A("Phoenix", "Duelist"), A("Raze", "Duelist"), A("Reyna", "Duelist"), A("Sage", "Sentinel"),
  A("Skye", "Initiator"), A("Sova", "Initiator"), A("Viper", "Controller"), A("Vyse", "Sentinel"),
  A("Yoru", "Duelist"), A("Waylay", "Duelist"), A("Tejo", "Initiator"), A("Veto", "Sentinel"), A("Clove ", "Controller"),
].filter((a, i, all) => all.findIndex((b) => b.uuid === a.uuid) === i);

const mk = (agentKey: string, source: "voiceline" | "user", title: string): Clip => ({
  id: `${source}:${agentKey}/${title}.wav`, agentKey, source, path: `/mock/${title}.wav`, defaultTitle: title,
});

const jett = "jett";
const CLIPS: Clip[] = [
  ...["Sample line 01", "Sample line 02", "Sample line 03", "Sample line 04", "Sample line 05", "Sample line 06"].map((t) => mk(jett, "voiceline", t)),
  ...["Nice one", "Gotcha", "Hello there", "Sorry team", "Rotate B", "Clutch time"].map((t) => mk(jett, "user", t)),
  ...["Ace!", "GG"].map((t) => mk("shared", "user", t)),
];

let state: AppState = {
  agents: AGENTS,
  detection: { state: "AGENT_SELECT", agentId: jett, selection: "locked", source: "mock", updatedAt: Date.now() },
  effectiveAgentId: jett,
  config: { ...defaultConfig(), ptt: { ...defaultConfig().ptt, key: { code: "KeyV", label: "V" } }, audio: { ...defaultConfig().audio, outputDeviceLabel: "Wave Link Soundboard" } },
  clips: [],
  playback: { clipId: null, startedAt: null, durationMs: null, phase: "idle" },
  sdClients: 1,
  unknownFolders: [],
  paths: { voicelines: "%AppData%\\ValoYap\\voicelines", clips: "%AppData%\\ValoYap\\clips", cache: "%AppData%\\ValoYap\\cache", config: "%AppData%\\ValoYap\\config.json" },
  agentFolder: "Jett",
  mode: "replay",
  lastError: null,
};
const listeners = new Set<(s: AppState) => void>();
function recompute() {
  const key = state.config.agent.manualAgentId ?? state.detection.agentId ?? "shared";
  state = { ...state, effectiveAgentId: state.config.agent.manualAgentId ?? state.detection.agentId, clips: resolveClipsLite(key, CLIPS, state.config), agentFolder: AGENTS.find((a) => a.uuid === key)?.name ?? "shared" };
  listeners.forEach((l) => l(state));
}
recompute();

let timer: number | undefined;
export const mockApi: ValoYapApi = {
  getState: async () => state,
  onState: (cb) => { listeners.add(cb); return (): void => void listeners.delete(cb); },
  play: async (clipId) => {
    window.clearTimeout(timer);
    state = { ...state, playback: { clipId, startedAt: Date.now(), durationMs: 2600, phase: "playing" } };
    recompute();
    timer = window.setTimeout(() => { state = { ...state, playback: { clipId: null, startedAt: null, durationMs: null, phase: "idle" } }; recompute(); }, 2600);
    return "ok";
  },
  stop: async () => { window.clearTimeout(timer); state = { ...state, playback: { clipId: null, startedAt: null, durationMs: null, phase: "idle" } }; recompute(); },
  setManualAgent: async (id) => { state = { ...state, config: { ...state.config, agent: { manualAgentId: id } } }; recompute(); },
  patchConfig: async (patch: any) => {
    const c: any = structuredClone(state.config);
    for (const k of Object.keys(patch)) Object.assign(c[k], patch[k]);
    state = { ...state, config: c }; recompute();
  },
  setClip: async (clipId, o) => {
    const c: any = structuredClone(state.config);
    const k = state.effectiveAgentId ?? "shared";
    (c.clips.overrides[k] ??= {})[clipId] = { ...(c.clips.overrides[k][clipId] ?? {}), ...o };
    state = { ...state, config: c }; recompute();
  },
  moveClip: async (clipId, dir) => {
    const k = state.effectiveAgentId ?? "shared";
    const ids = state.clips.map((c) => c.id); const i = ids.indexOf(clipId);
    const src = state.clips[i]?.source; let j = i + dir;
    while (j >= 0 && j < ids.length && state.clips[j].source !== src) j += dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const c: any = structuredClone(state.config); c.clips.order[k] = ids;
    state = { ...state, config: c }; recompute();
  },
  addFiles: async () => 0,
  importFolder: async () => 0,
  openFolder: async () => {},
  rescan: async () => {},
  pttTest: async () => "Held V for 2s.",
  onAudioPlay: () => () => {},
  onAudioStop: () => () => {},
  audioStarted: () => {},
  audioEnded: () => {},
};

/** Hooks for the screenshot script. */
(window as any).__mock = {
  setDetection: (d: Partial<AppState["detection"]>) => { state = { ...state, detection: { ...state.detection, ...d } }; recompute(); },
  setMode: (m: AppState["mode"]) => { state = { ...state, mode: m }; recompute(); },
  empty: (e: boolean) => { CLIPS.length = 0; if (!e) return; recompute(); },
};
