import streamDeck, { type KeyAction } from "@elgato/streamdeck";
import type { SdStateMessage } from "@valoyap/shared";
import { Bridge } from "./bridge";
import { clipKeyIndex, clipsPerPage, clampPage, pageCount, profileFor, profilePath, roleAt } from "./layout";
import { keyView } from "./view";

const PLUGIN_VERSION = "0.1.0";
const DEFAULT_PORT = 38120;
const ID = "com.carsonjf.valoyap";

let state: SdStateMessage | null = null;
let connected = false;
/** Per-device page index. */
const pages = new Map<string, number>();
/** Agent for which each device was last switched to the soundboard (to avoid re-switching on every message). */
const switchedFor = new Map<string, string>();

function keysOf(deviceId?: string): KeyAction<any>[] {
  const out: KeyAction<any>[] = [];
  streamDeck.devices.forEach((d) => {
    if (deviceId && d.id !== deviceId) return;
    for (const a of d.actions) if (a.isKey() && a.manifestId.startsWith(ID)) out.push(a);
  });
  return out;
}

async function paint(a: KeyAction<any>): Promise<void> {
  const size = a.device.size;
  const c = a.coordinates;
  if (!c) return;
  const v = keyView(connected ? state : null, size.columns, size.rows, c.column, c.row, pages.get(a.device.id) ?? 0);
  await a.setTitle(v.title);
  await a.setImage(v.image);
}

const repaint = (deviceId?: string) => Promise.all(keysOf(deviceId).map((a) => paint(a).catch(() => undefined)));

function inMatchLike(s: SdStateMessage | null): boolean {
  return !!s && s.agent.id !== null && (s.detection.state === "AGENT_SELECT" || s.detection.state === "IN_MATCH");
}

async function onState(msg: SdStateMessage): Promise<void> {
  const prev = state;
  state = msg;
  if (inMatchLike(msg)) {
    streamDeck.devices.forEach((d) => {
      const profile = profileFor(d.type);
      if (!profile || !d.isConnected) return;
      // Switch once per agent. Pressing Back sets the marker so we do not yank the user back until the agent changes.
      if (switchedFor.get(d.id) !== msg.agent.id) {
        switchedFor.set(d.id, msg.agent.id!);
        pages.set(d.id, 0);
        void streamDeck.profiles.switchToProfile(d.id, profilePath(profile)).catch((e) => streamDeck.logger.warn(`switchToProfile failed: ${e}`));
      }
    });
  } else if (prev && inMatchLike(prev)) {
    // Left the match / game closed: return to whatever profile the user was on.
    streamDeck.devices.forEach((d) => {
      if (switchedFor.has(d.id)) void streamDeck.profiles.switchToProfile(d.id).catch(() => undefined);
    });
    switchedFor.clear();
  }
  await repaint();
}

streamDeck.actions.onWillAppear((ev) => {
  if (ev.action.isKey()) void paint(ev.action);
});

streamDeck.actions.onKeyDown(async (ev) => {
  if (!ev.action.isKey()) return;
  const a = ev.action;
  const c = a.coordinates;
  if (!c) return;
  const { columns, rows } = a.device.size;
  const role = roleAt(columns, rows, c.column, c.row);
  const devId = a.device.id;

  if (!connected || !state) return void a.showAlert();

  if (role === "back") {
    // Mark as handled for this agent so we do not immediately re-switch.
    if (state.agent.id) switchedFor.set(devId, state.agent.id);
    return void streamDeck.profiles.switchToProfile(devId);
  }
  const per = clipsPerPage(columns, rows);
  const total = pageCount(state.slots.length, per);
  if (role === "prev" || role === "next") {
    const cur = clampPage(pages.get(devId) ?? 0, total);
    pages.set(devId, clampPage(cur + (role === "next" ? 1 : -1), total));
    return void (await repaint(devId));
  }
  const slot = state.slots[clampPage(pages.get(devId) ?? 0, total) * per + clipKeyIndex(columns, rows, c.column, c.row)];
  if (!slot) return void a.showAlert();
  if (state.playback.clipId === slot.clipId && state.playback.phase !== "idle") bridge.send({ type: "stop" });
  else bridge.send({ type: "play", clipId: slot.clipId });
});

streamDeck.devices.onDeviceDidConnect(() => void repaint());

const bridge = new Bridge(DEFAULT_PORT, PLUGIN_VERSION, {
  onState: (m) => void onState(m),
  onStatus: (c) => {
    connected = c;
    if (!c) {
      streamDeck.logger.info("ValoYap desktop app not reachable; retrying");
      state = null;
    }
    void repaint();
  },
});

await streamDeck.connect();
bridge.start();
