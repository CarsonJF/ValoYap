import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseLogLine, DetectionMachine, mapFlowState, DetectionService, parseLockfile,
  pickPregameAgent, pickCoreGameAgent, resolveAgentWithRetry, HttpError, LogTailer,
} from "../src";

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = fs.readFileSync(path.join(here, "../fixtures/sample-session.log"), "utf8").split(/\r?\n/).filter(Boolean);
const JETT = "add6443a-41bd-e414-f6ad-e58d267f4e95";
const ME = "d0f58137-6a56-5a05-be28-fcf107c40ddb";

describe("logParser", () => {
  it("parses game flow transitions", () => {
    const [e] = parseLogLine(sample[3]);
    expect(e).toEqual({ kind: "gameflow", from: "TransitionToMainMenu", to: "MainMenu" });
  });
  it("ignores 'No action taken' reconcile lines", () => {
    expect(parseLogLine(sample[0])).toEqual([]);
  });
  it("reads GLZ base URL and puuid from HTTP query lines", () => {
    const ev = parseLogLine(sample[1]);
    expect(ev).toContainEqual({ kind: "glz", baseUrl: "https://glz-na-1.na.a.pvp.net", region: "na", shard: "na" });
    expect(ev).toContainEqual({ kind: "puuid", puuid: ME });
  });
  it("detects select and lock actions", () => {
    expect(parseLogLine(sample[6])).toContainEqual({ kind: "agentAction", action: "select" });
    expect(parseLogLine(sample[7])).toContainEqual({ kind: "agentAction", action: "lock" });
  });
  it("handles non-na shards", () => {
    const l = "LogPlatformCommon: Platform HTTP Query End. QueryName: [Party_FetchParty], URL [GET https://glz-latam-1.na.a.pvp.net/parties/v1/parties/x]";
    expect(parseLogLine(l)).toContainEqual({ kind: "glz", baseUrl: "https://glz-latam-1.na.a.pvp.net", region: "latam", shard: "na" });
  });
});

describe("mapFlowState", () => {
  it.each([
    ["MainMenu", "MENU"], ["TransitionToMainMenu", "MENU"], ["Initialization", "MENU"],
    ["Pregame", "AGENT_SELECT"], ["TransitionToPregame", "AGENT_SELECT"],
    ["InGame", "IN_MATCH"], ["TransitionToInGame", "IN_MATCH"], ["Whatever", null],
  ])("%s -> %s", (n, s) => expect(mapFlowState(n)).toBe(s));
});

describe("DetectionMachine", () => {
  it("walks menu -> agent select -> match -> menu and fires once per change", () => {
    const seen: string[] = [];
    const m = new DetectionMachine((e) => e.type === "state" && seen.push(e.to));
    m.setGameRunning(true);
    for (const l of sample) m.feed(parseLogLine(l));
    expect(seen).toEqual(["MENU", "AGENT_SELECT", "IN_MATCH", "MENU"]);
    expect(m.snapshot.glzBase).toBe("https://glz-na-1.na.a.pvp.net");
  });
  it("goes OFFLINE when the game exits and clears the GLZ base", () => {
    const m = new DetectionMachine();
    m.setGameRunning(true);
    m.feed(parseLogLine(sample[1]));
    m.setGameRunning(false);
    expect(m.snapshot).toMatchObject({ state: "OFFLINE", glzBase: null });
  });
});

describe("agent picking", () => {
  it("pregame: finds my CharacterID and lock state", () => {
    const match = { AllyTeam: { Players: [{ Subject: "x", CharacterID: "a" }, { Subject: ME.toUpperCase(), CharacterID: JETT.toUpperCase(), CharacterSelectionState: "locked" }] } };
    expect(pickPregameAgent(match, ME)).toEqual({ agentId: JETT, selection: "locked" });
  });
  it("pregame: nothing hovered yet", () => {
    expect(pickPregameAgent({ AllyTeam: { Players: [{ Subject: ME, CharacterID: "" }] } }, ME).selection).toBe("none");
  });
  it("core-game: finds my CharacterID", () => {
    expect(pickCoreGameAgent({ Players: [{ Subject: ME, CharacterID: JETT }] }, ME)).toEqual({ agentId: JETT, selection: "locked" });
  });
});

describe("resolveAgentWithRetry", () => {
  it("retries 404 a bounded number of times, then succeeds", async () => {
    let calls = 0;
    const reader = {
      getAuth: async () => ({ accessToken: "a", entitlementsToken: "e", puuid: ME }),
      glzGet: async (_b: string, p: string) => {
        if (p.includes("/players/")) { if (++calls < 3) throw new HttpError(404, p, ""); return { MatchID: "m" }; }
        return { AllyTeam: { Players: [{ Subject: ME, CharacterID: JETT, CharacterSelectionState: "selected" }] } };
      },
    };
    const r = await resolveAgentWithRetry(reader as any, "AGENT_SELECT", "https://glz", { sleep: async () => {} });
    expect(r).toEqual({ agentId: JETT, selection: "selected" });
    expect(calls).toBe(3);
  });
  it("gives up after the delay list and does not retry on 403", async () => {
    let calls = 0;
    const reader = { getAuth: async () => { calls++; throw new HttpError(403, "x", ""); }, glzGet: async () => ({}) };
    await expect(resolveAgentWithRetry(reader as any, "IN_MATCH", "g", { sleep: async () => {} })).rejects.toBeInstanceOf(HttpError);
    expect(calls).toBe(1);
  });
});

describe("DetectionService (replay)", () => {
  it("replays the sample session and resolves only on transitions/actions", async () => {
    vi.useFakeTimers();
    const resolve = vi.fn(async (state: string) => ({ agentId: JETT, selection: state === "IN_MATCH" ? ("locked" as const) : ("selected" as const) }));
    const svc = new DetectionService({ resolve: resolve as any, debounceMs: 10 });
    const states: string[] = [];
    svc.on("detection", (d) => states.push(`${d.state}:${d.agentId ?? "-"}`));
    svc.setGameRunning(true);
    for (const l of sample.slice(0, 4)) svc.feedLine(l);
    expect(resolve).not.toHaveBeenCalled(); // no polling while in menu
    for (const l of sample.slice(4, 8)) svc.feedLine(l);
    await vi.advanceTimersByTimeAsync(50);
    for (const l of sample.slice(8)) { svc.feedLine(l); await vi.advanceTimersByTimeAsync(5); }
    vi.useRealTimers();
    expect(states).toContain(`AGENT_SELECT:${JETT}`);
    expect(states).toContain(`IN_MATCH:${JETT}`);
    expect(states.at(-1)).toBe("MENU:-");
  });
});

describe("parseLockfile", () => {
  it("parses port + password", () => {
    expect(parseLockfile("Riot Client:1234:51234:s3cret:https")).toEqual({ port: 51234, password: "s3cret" });
    expect(parseLockfile("junk")).toBeNull();
  });
});

describe("LogTailer", () => {
  it("emits appended lines, handles partial lines and truncation", async () => {
    const f = path.join(fs.mkdtempSync(path.join(process.env.TEMP ?? ".", "vy-")), "t.log");
    fs.writeFileSync(f, "old\n");
    const lines: string[] = [];
    const t = new LogTailer(f, (l) => lines.push(l));
    t.start(); t.stop(); await new Promise((r) => setTimeout(r, 50));
    fs.appendFileSync(f, "a\nb");
    await t.tick();
    expect(lines).toEqual(["a"]);
    fs.appendFileSync(f, "c\n");
    await t.tick();
    expect(lines).toEqual(["a", "bc"]);
    fs.writeFileSync(f, "new\n");
    await t.tick();
    expect(lines.at(-1)).toBe("new");
  });
});

describe("read-only guarantee", () => {
  it("detection code only ever issues GET requests", () => {
    const dir = path.join(here, "../src/detection");
    const src = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
    expect(src).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)/i);
    expect(src).not.toMatch(/fetch\(/);
  });
});
