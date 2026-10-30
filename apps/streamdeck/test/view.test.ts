import { describe, expect, it } from "vitest";
import type { SdStateMessage } from "@valoyap/shared";
import { keyView, wrapTitle } from "../src/view";

const slots = Array.from({ length: 14 }, (_, i) => ({ clipId: `c${i + 1}`, key: i + 1, title: `Clip ${i + 1}` }));
const state = (over: Partial<SdStateMessage> = {}): SdStateMessage => ({
  type: "state",
  detection: { state: "IN_MATCH", agentId: "jett", selection: "none", source: "log+api", updatedAt: 0 },
  agent: { id: "jett", name: "Jett", role: "Duelist" },
  slots,
  playback: { clipId: null, startedAt: null, durationMs: null, phase: "idle" },
  pttMode: "synthetic",
  ...over,
});

describe("keyView", () => {
  it("maps keys to slots by page (5x3 has 12 clip keys)", () => {
    expect(keyView(state(), 5, 3, 0, 0, 0).clipId).toBe("c1");
    expect(keyView(state(), 5, 3, 1, 2, 0).clipId).toBe("c12");
    expect(keyView(state(), 5, 3, 0, 0, 1).clipId).toBe("c13");
    expect(keyView(state(), 5, 3, 2, 0, 1).clipId).toBeUndefined(); // only 14 slots
  });
  it("clamps an out-of-range page", () => {
    expect(keyView(state(), 5, 3, 0, 0, 9).clipId).toBe("c13");
  });
  it("has control keys", () => {
    expect(keyView(state(), 5, 3, 4, 2, 0).role).toBe("back");
    expect(keyView(state(), 5, 3, 3, 2, 0).role).toBe("next");
  });
  it("highlights the playing clip with a red background", () => {
    const v = keyView(state({ playback: { clipId: "c1", startedAt: 1, durationMs: 1000, phase: "playing" } }), 5, 3, 0, 0, 0);
    expect(decodeURIComponent(v.image)).toContain('fill="#ff4655"/>');
  });
  it("renders offline", () => {
    expect(decodeURIComponent(keyView(null, 5, 3, 0, 0, 0).image)).toContain("OFFLINE");
  });
});

describe("wrapTitle", () => {
  it("wraps to two lines and truncates", () => {
    expect(wrapTitle("Nice one team").split("\n")).toEqual(["Nice one", "team"]);
    expect(wrapTitle("Supercalifragilistic").length).toBeLessThanOrEqual(11);
  });
});
