import { app, BrowserWindow, dialog, ipcMain, session, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import {
  appPaths, ConfigStore, DetectionService, LogTailer, PlaybackController, RiotClient, WindowsKeyInjector,
  folderToAgentKey, agentKeyToFolder, loadAgents, resolveAgentWithRetry, resolveClips, scanDir, watchDirs,
  shooterGameLog, HttpError, SHARED, AUDIO_EXTS,
} from "@valoyap/core";
import type { AgentInfo, AppState, Clip, Config, SdCommand, SdStateMessage } from "@valoyap/shared";
import { RendererAudioEngine } from "./audioEngine";
import { installProtocols, registerSchemes } from "./media";
import { SdServer } from "./sdServer";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.some((a) => a === `--${n}` || a.startsWith(`--${n}=`));
const flagVal = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const MODE: AppState["mode"] = flag("replay") ? "replay" : flag("mock") ? "mock" : "live";

const paths = appPaths();
app.setName("ValoYap");
app.setPath("userData", path.join(paths.root, "electron"));
registerSchemes();

if (!app.requestSingleInstanceLock()) app.quit();

let win: BrowserWindow | null = null;
let agents: AgentInfo[] = [];
let allClips: Clip[] = [];
let unknownFolders: string[] = [];
let lastError: string | null = null;
let sdClients = 0;
let stopWatch: (() => void) | null = null;
let tailer: LogTailer | null = null;
let processTimer: NodeJS.Timeout | null = null;
const iconCache = new Map<string, string>();

const store = new ConfigStore(paths.config);
const cfg = (): Config => store.get();

const injector = new WindowsKeyInjector();
const audio = new RendererAudioEngine(() => win, () => cfg().audio.outputDeviceId);
const playback = new PlaybackController(audio, injector, cfg);
playback.on("state", () => pushState());
playback.on("error", (e: Error) => setError(`Playback: ${e.message}`));

const riot = new RiotClient();
const detection = new DetectionService({
  source: MODE === "live" ? "log+api" : "mock",
  resolve: async (state, glz, stale) => {
    if (MODE === "live") return resolveAgentWithRetry(riot, state, glz, { isStale: stale });
    return mockResolve(state);
  },
});
detection.on("detection", () => pushState());
detection.on("error", (e: unknown) => {
  if (e instanceof HttpError && (e.status === 404 || e.status === 400)) return; // match not ready yet
  setError(`Detection: ${(e as Error).message}`);
});

// ---------- state ----------
const effectiveAgentId = () => cfg().agent.manualAgentId ?? detection.current.agentId;
const viewKey = () => effectiveAgentId() ?? SHARED;

function buildState(): AppState {
  const c = cfg();
  const eff = effectiveAgentId();
  return {
    agents,
    detection: detection.current,
    effectiveAgentId: eff,
    config: c,
    clips: resolveClips(viewKey(), allClips, c),
    playback: playback.current,
    sdClients,
    unknownFolders,
    paths: { voicelines: paths.voicelines, clips: paths.clips, cache: paths.cache, config: paths.config },
    agentFolder: agentKeyToFolder(viewKey(), agents),
    mode: MODE,
    lastError,
  };
}

function agentIconDataUrl(id: string | null): string | undefined {
  if (!id) return undefined;
  if (iconCache.has(id)) return iconCache.get(id);
  try {
    const buf = fs.readFileSync(path.join(paths.cache, "agents", id, "icon.png"));
    const url = `data:image/png;base64,${buf.toString("base64")}`;
    iconCache.set(id, url);
    return url;
  } catch {
    return undefined;
  }
}

function buildSdState(s: AppState): SdStateMessage {
  const agent = agents.find((a) => a.uuid === s.effectiveAgentId);
  return {
    type: "state",
    detection: { ...s.detection, agentId: s.effectiveAgentId },
    agent: { id: s.effectiveAgentId, name: agent?.name ?? "", role: agent?.role ?? "", iconDataUrl: agentIconDataUrl(s.effectiveAgentId) },
    slots: s.clips.filter((c) => c.enabled).map((c) => ({ clipId: c.id, key: c.key, title: c.title })),
    playback: s.playback,
    pttMode: s.config.ptt.mode,
  };
}

let pushTimer: NodeJS.Timeout | null = null;
function pushState(): void {
  if (pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const s = buildState();
    if (win && !win.isDestroyed()) win.webContents.send("state:update", s);
    sd.broadcast(buildSdState(s));
  }, 16);
}

function setError(msg: string | null): void {
  lastError = msg;
  if (msg) console.error("[valoyap]", msg);
  pushState();
}

// ---------- clips ----------
function rescanClips(): void {
  const a = scanDir(paths.voicelines, "voiceline", agents);
  const b = scanDir(paths.clips, "user", agents);
  allClips = [...a.clips, ...b.clips];
  unknownFolders = [...new Set([...a.unknownFolders, ...b.unknownFolders])];
  pushState();
}

function copyInto(root: string, folder: string, files: string[]): number {
  const dir = path.join(root, folder);
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  for (const f of files) {
    if (!AUDIO_EXTS.has(path.extname(f).toLowerCase())) continue;
    let dest = path.join(dir, path.basename(f));
    for (let i = 2; fs.existsSync(dest); i++) {
      dest = path.join(dir, `${path.basename(f, path.extname(f))} (${i})${path.extname(f)}`);
    }
    fs.copyFileSync(f, dest);
    n++;
  }
  return n;
}

// ---------- mock detection (replay / mock modes only) ----------
let mockSelectCalls = 0;
function mockResolve(state: string) {
  const name = (flagVal("agent") ?? "Jett").toLowerCase();
  const id = agents.find((a) => a.name.toLowerCase() === name)?.uuid ?? agents[0]?.uuid ?? null;
  if (state === "AGENT_SELECT") return { agentId: id, selection: ++mockSelectCalls > 1 ? ("locked" as const) : ("selected" as const) };
  return { agentId: id, selection: "locked" as const };
}

function startReplay(): void {
  const file = path.join(__dirname, "../../../../packages/core/fixtures/sample-session.log");
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  const delay = Number(flagVal("replay-delay") ?? 3000);
  detection.setGameRunning(true);
  let i = 0;
  const step = () => {
    if (i >= lines.length) return;
    detection.feedLine(lines[i++]);
    setTimeout(step, delay);
  };
  setTimeout(step, 1500);
}

// ---------- live detection ----------
const GAME_EXE = "VALORANT-Win64-Shipping.exe";
function checkGameRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("tasklist", ["/FI", `IMAGENAME eq ${GAME_EXE}`, "/NH", "/FO", "CSV"], { windowsHide: true }, (err, out) =>
      resolve(!err && out.toLowerCase().includes(GAME_EXE.toLowerCase())),
    );
  });
}

async function startLive(): Promise<void> {
  detection.setGameRunning(await checkGameRunning());
  tailer = new LogTailer(shooterGameLog(), (l) => detection.feedLine(l), { replayExisting: true });
  tailer.start();
  processTimer = setInterval(async () => detection.setGameRunning(await checkGameRunning()), 5000);
}

// ---------- Stream Deck ----------
const sd = new SdServer(
  (cmd: SdCommand) => {
    if (cmd.type === "play") void doPlay(cmd.clipId);
    else if (cmd.type === "stop") playback.stop();
    else if (cmd.type === "manualAgent") setManual(cmd.agentId);
  },
  (n) => {
    sdClients = n;
    pushState();
  },
);

async function doPlay(clipId: string): Promise<string> {
  const clip = buildState().clips.find((c) => c.id === clipId && c.enabled);
  if (!clip) return "missing";
  return playback.play(clip);
}

function setManual(id: string | null): void {
  store.update((c) => {
    c.agent.manualAgentId = id;
  });
}

// ---------- IPC ----------
function registerIpc(): void {
  ipcMain.handle("state:get", () => buildState());
  ipcMain.handle("clip:play", (_e, id: string) => doPlay(id));
  ipcMain.handle("clip:stop", () => playback.stop());
  ipcMain.handle("agent:manual", (_e, id: string | null) => setManual(id));
  ipcMain.handle("config:patch", (_e, patch: Record<string, Record<string, unknown>>) => {
    store.update((c) => {
      for (const section of ["audio", "ptt", "clips", "agent", "streamDeck"] as const) {
        if (patch?.[section] && typeof patch[section] === "object") Object.assign((c as any)[section], patch[section]);
      }
    });
  });
  ipcMain.handle("clip:set", (_e, clipId: string, o: { title?: string; enabled?: boolean; volume?: number }) => {
    store.update((c) => {
      const k = viewKey();
      const cur = (c.clips.overrides[k] ??= {});
      cur[clipId] = { ...cur[clipId], ...o };
    });
  });
  ipcMain.handle("clip:move", (_e, clipId: string, dir: -1 | 1) => {
    const list = resolveClips(viewKey(), allClips, cfg());
    const i = list.findIndex((c) => c.id === clipId);
    if (i < 0) return;
    let j = i + dir;
    while (j >= 0 && j < list.length && list[j].source !== list[i].source) j += dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    store.update((c) => {
      c.clips.order[viewKey()] = list.map((x) => x.id);
    });
  });
  ipcMain.handle("clip:add", async (_e, source: "voiceline" | "user") => {
    if (!win) return 0;
    const r = await dialog.showOpenDialog(win, {
      title: "Add audio files",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Audio", extensions: [...AUDIO_EXTS].map((e) => e.slice(1)) }],
    });
    if (r.canceled) return 0;
    const n = copyInto(source === "user" ? paths.clips : paths.voicelines, agentKeyToFolder(viewKey(), agents), r.filePaths);
    rescanClips();
    return n;
  });
  ipcMain.handle("clip:import-folder", async () => {
    if (!win) return 0;
    const r = await dialog.showOpenDialog(win, { title: "Import a folder of voice lines", properties: ["openDirectory"] });
    if (r.canceled || !r.filePaths[0]) return 0;
    const src = r.filePaths[0];
    let n = 0;
    // Folder of agent sub-folders (Jett/, Sova/, shared/) -> keep the structure; otherwise treat as the current agent.
    const sub = fs.readdirSync(src, { withFileTypes: true }).filter((d) => d.isDirectory());
    const mapped = sub.filter((d) => folderToAgentKey(d.name, agents));
    if (mapped.length) {
      for (const d of mapped) {
        const files = fs.readdirSync(path.join(src, d.name)).map((f) => path.join(src, d.name, f));
        n += copyInto(paths.voicelines, agentKeyToFolder(folderToAgentKey(d.name, agents)!, agents), files);
      }
    } else {
      const files = fs.readdirSync(src, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => path.join(src, d.name));
      n = copyInto(paths.voicelines, agentKeyToFolder(viewKey(), agents), files);
    }
    rescanClips();
    return n;
  });
  ipcMain.handle("open:folder", (_e, kind: "voicelines" | "clips" | "cache" | "config") => {
    const target = kind === "config" ? path.dirname(paths.config) : paths[kind];
    fs.mkdirSync(target, { recursive: true });
    return shell.openPath(target).then(() => undefined);
  });
  ipcMain.handle("clips:rescan", () => rescanClips());
  ipcMain.handle("ptt:test", async () => {
    const k = cfg().ptt.key;
    if (!k) return "Set a PTT key first.";
    if (playback.current.phase !== "idle") return "A clip is playing.";
    try {
      injector.down(k.code, cfg().ptt.inputMethod);
      await new Promise((r) => setTimeout(r, 2000));
      return `Held ${k.label} for 2s.`;
    } catch (e) {
      return `Failed: ${(e as Error).message}`;
    } finally {
      try {
        injector.up(k.code, cfg().ptt.inputMethod);
      } catch {}
    }
  });
}

// ---------- window / lifecycle ----------
function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: "#0f1923",
    title: "ValoYap",
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#0f1923", symbolColor: "#ece8e1", height: 40 },
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  win.on("closed", () => (win = null));
}

app.whenReady().then(async () => {
  fs.mkdirSync(paths.root, { recursive: true });
  for (const d of [paths.voicelines, paths.clips, paths.cache]) fs.mkdirSync(d, { recursive: true });
  store.load();
  store.on("change", pushState); // Stream Deck port changes need an app restart
  installProtocols(paths);
  // Output-device labels need the media permission in Chromium.
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === "media"));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => perm === "media");
  registerIpc();
  createWindow();
  sd.start(cfg().streamDeck.port);
  watchStart();
  agents = await loadAgents(paths.cache, (a) => {
    agents = a;
    rescanClips();
  });
  rescanClips();
  if (MODE === "live") await startLive();
  else if (MODE === "replay") startReplay();
});

function watchStart(): void {
  stopWatch = watchDirs([paths.voicelines, paths.clips], rescanClips);
}

function shutdown(): void {
  playback.dispose(); // releases a held PTT key
  stopWatch?.();
  tailer?.stop();
  if (processTimer) clearInterval(processTimer);
  sd.stop();
}
app.on("before-quit", shutdown);
app.on("window-all-closed", () => app.quit());
app.on("second-instance", () => win?.focus());
