import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultConfig, migrateConfig, ConfigSchema, type Clip, type AgentInfo } from "@valoyap/shared";
import { scanDir, resolveClips, reorder, folderToAgentKey, ConfigStore, parseAgents, computeGain, PlaybackController, keyboardInputFor } from "../src";
import { keyForCode } from "@valoyap/shared";

const agents: AgentInfo[] = [
  { uuid: "aaa", name: "Jett", role: "Duelist" },
  { uuid: "bbb", name: "KAY/O", role: "Initiator" },
];
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "valoyap-"));

describe("config schema", () => {
  it("defaults are valid and carry a version", () => {
    const c = defaultConfig();
    expect(c.version).toBe(1);
    expect(c.audio.cooldownMs).toBe(4000);
    expect(c.audio.volumeCap).toBeLessThanOrEqual(1);
    expect(c.ptt.preRollMs).toBeGreaterThanOrEqual(80);
  });
  it("has no ranked toggle", () => {
    expect(JSON.stringify(defaultConfig()).toLowerCase()).not.toContain("ranked");
  });
  it("salvages valid sections when one is corrupt, and unversioned files", () => {
    const c = migrateConfig({ version: 1, audio: { volume: 5 }, ptt: { preRollMs: 200 } });
    expect(c.audio.volume).toBe(0.7);
    expect(c.ptt.preRollMs).toBe(200);
    expect(migrateConfig({ ptt: { tailMs: 300 } }).ptt.tailMs).toBe(300);
    expect(migrateConfig("garbage").version).toBe(1);
  });
  it("rejects out-of-range values", () => {
    expect(ConfigSchema.safeParse({ ...defaultConfig(), audio: { ...defaultConfig().audio, cooldownMs: -1 } }).success).toBe(false);
  });
  it("store persists atomically and survives a corrupt file", () => {
    const d = tmp(), f = path.join(d, "config.json");
    const s = new ConfigStore(f); s.load();
    s.update((c) => { c.audio.volume = 0.3; });
    expect(new ConfigStore(f).load().audio.volume).toBe(0.3);
    fs.writeFileSync(f, "{not json");
    expect(new ConfigStore(f).load().audio.volume).toBe(0.7);
    expect(fs.readdirSync(d).some((n) => n.includes("corrupt"))).toBe(true);
  });
});

describe("clip library", () => {
  const mk = (id: string, agentKey: string, t: string, source: Clip["source"] = "user"): Clip => ({ id, agentKey, source, path: `/${id}`, defaultTitle: t });
  const all = [mk("u:a1", "aaa", "Alpha 2"), mk("u:a2", "aaa", "Alpha 10"), mk("v:a1", "aaa", "Line", "voiceline"), mk("u:s1", "shared", "Shared one"), mk("u:b1", "bbb", "Other")];
  const cfg = () => defaultConfig();

  it("scans folders by agent name (KAY/O -> kayo) and flags unknown folders", () => {
    const d = tmp();
    for (const [dir, f] of [["Jett", "a.wav"], ["kayo", "b.mp3"], ["shared", "c.ogg"], ["Nobody", "d.wav"], ["Jett", "notes.txt"]]) {
      fs.mkdirSync(path.join(d, dir), { recursive: true });
      fs.writeFileSync(path.join(d, dir, f), "x");
    }
    const r = scanDir(d, "user", agents);
    expect(r.clips.map((c) => c.id).sort()).toEqual(["user:aaa/a.wav", "user:bbb/b.mp3", "user:shared/c.ogg"]);
    expect(r.unknownFolders).toEqual(["Nobody"]);
    expect(folderToAgentKey("KAY-O", agents)).toBe("bbb");
  });
  it("lists agent clips (voiceline first, natural order) then shared, with key numbers", () => {
    const r = resolveClips("aaa", all, cfg());
    expect(r.map((c) => c.id)).toEqual(["v:a1", "u:a1", "u:a2", "u:s1"]);
    expect(r.map((c) => c.key)).toEqual([1, 2, 3, 4]);
  });
  it("honours saved order, rename, disable (key 0, numbering skips it) and volume", () => {
    const c = cfg();
    c.clips.order.aaa = ["u:s1", "u:a2"];
    c.clips.overrides.aaa = { "u:a2": { title: "  Renamed ", volume: 0.5 }, "v:a1": { enabled: false } };
    const r = resolveClips("aaa", all, c);
    expect(r.map((x) => x.id)).toEqual(["u:s1", "u:a2", "v:a1", "u:a1"]);
    expect(r.find((x) => x.id === "u:a2")).toMatchObject({ title: "Renamed", volume: 0.5, key: 2 });
    expect(r.find((x) => x.id === "v:a1")).toMatchObject({ enabled: false, key: 0 });
    expect(resolveClips("aaa", all, c, { includeDisabled: false })).toHaveLength(3);
  });
  it("can exclude shared clips and filter by source", () => {
    const c = cfg(); c.clips.includeShared = false;
    expect(resolveClips("aaa", all, c).some((x) => x.agentKey === "shared")).toBe(false);
    expect(resolveClips("aaa", all, cfg(), { source: "voiceline" }).map((x) => x.id)).toEqual(["v:a1"]);
  });
  it("reorder swaps neighbours and clamps at the ends", () => {
    expect(reorder(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(reorder(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
  });
});

describe("agents", () => {
  it("parses and sorts the API payload", () => {
    const r = parseAgents({ data: [{ uuid: "2", displayName: "Sova" }, { uuid: "1", displayName: "Jett" }, { uuid: "", displayName: "x" }] });
    expect(r.map((a) => a.displayName)).toEqual(["Jett", "Sova"]);
    expect(parseAgents(null)).toEqual([]);
  });
});

describe("volume cap + playback + PTT", () => {
  it("caps the final gain", () => {
    const a = defaultConfig().audio;
    expect(computeGain({ ...a, volume: 1, volumeCap: 0.5 }, 1)).toBe(0.5);
    expect(computeGain({ ...a, volume: 0.5, volumeCap: 0.9 }, 0.5)).toBe(0.25);
  });
  it("builds scancode and vk SendInput flags", () => {
    const space = keyForCode("Space")!, right = keyForCode("ArrowRight")!;
    expect(keyboardInputFor(space, false, "scancode")).toEqual({ wVk: 0, wScan: 0x39, dwFlags: 0x8 });
    expect(keyboardInputFor(right, true, "scancode").dwFlags).toBe(0x8 | 0x1 | 0x2);
    expect(keyboardInputFor(space, false, "vk")).toEqual({ wVk: 0x20, wScan: 0x39, dwFlags: 0 });
  });

  function setup(opts: { fail?: boolean } = {}) {
    const log: string[] = [];
    let t = 0;
    const clock = { now: () => t, sleep: async (ms: number) => { t += ms; log.push(`sleep ${ms}`); } };
    const injector = { down: (c: string) => log.push(`down ${c}`), up: (c: string) => log.push(`up ${c}`) };
    const audio = {
      play: async (_c: any, gain: number, onStart: (d: number) => void) => {
        log.push(`play ${gain.toFixed(2)}`); onStart(1000); t += 1000;
        if (opts.fail) throw new Error("boom");
      },
      stop: () => log.push("audio.stop"),
    };
    const cfg = defaultConfig();
    cfg.ptt.key = { code: "KeyV", label: "V" };
    const pc = new PlaybackController(audio, injector, () => cfg, clock);
    pc.on("error", () => {});
    return { pc, log, cfg, advance: (ms: number) => { t += ms; } };
  }
  const clip = { id: "c1", volume: 1 } as any;

  it("holds PTT around the clip: down, pre-roll, play, tail, up", async () => {
    const { pc, log } = setup();
    expect(await pc.play(clip)).toBe("ok");
    expect(log).toEqual(["down KeyV", "sleep 120", "play 0.70", "sleep 150", "up KeyV"]);
  });
  it("enforces the per-clip cooldown, then allows again", async () => {
    const { pc, advance } = setup();
    expect(await pc.play(clip)).toBe("ok");
    expect(await pc.play(clip)).toBe("cooldown");
    expect(await pc.play({ ...clip, id: "c2" })).toBe("ok");
    advance(5000);
    expect(await pc.play(clip)).toBe("ok");
  });
  it("always releases PTT when the audio fails", async () => {
    const { pc, log } = setup({ fail: true });
    expect(await pc.play(clip)).toBe("error");
    expect(log.at(-1)).toBe("up KeyV");
    expect(pc.current.phase).toBe("idle");
  });
  it("does not touch the keyboard in external PTT mode", async () => {
    const { pc, log, cfg } = setup();
    cfg.ptt.mode = "external";
    await pc.play(clip);
    expect(log.some((l) => l.startsWith("down"))).toBe(false);
  });
});
