import { describe, expect, it } from "vitest";
import { ConfigSchema, CONFIG_VERSION, defaultConfig, migrateConfig, pickDefaultOutput, keyForCode } from "../src";

describe("config", () => {
  it("has safe defaults and no ranked option", () => {
    const c = defaultConfig();
    expect(c.version).toBe(CONFIG_VERSION);
    expect(c.audio.cooldownMs).toBe(4000);
    expect(c.audio.volumeCap).toBeLessThanOrEqual(1);
    expect(JSON.stringify(c).toLowerCase()).not.toContain("ranked");
  });
  it("rejects out-of-range values", () => {
    expect(ConfigSchema.safeParse({ version: 1, audio: { volume: 2 } }).success).toBe(false);
  });
  it("migrates garbage and old versions to defaults, salvaging valid sections", () => {
    expect(migrateConfig(null)).toEqual(defaultConfig());
    expect(migrateConfig("x")).toEqual(defaultConfig());
    const m = migrateConfig({ version: 0, audio: { volume: 0.3 }, ptt: { preRollMs: 99999 } });
    expect(m.audio.volume).toBe(0.3);
    expect(m.ptt.preRollMs).toBe(defaultConfig().ptt.preRollMs);
  });
});

describe("pickDefaultOutput", () => {
  const d = (label: string) => ({ deviceId: label, label });
  it("prefers the Wave Link soundboard", () => {
    expect(pickDefaultOutput([d("Speakers"), d("Wave Link Aux 2"), d("Wave Link Soundboard")])?.label).toBe("Wave Link Soundboard");
  });
  it("never picks a physical device", () => {
    expect(pickDefaultOutput([d("Speakers"), d("Headset")])).toBeNull();
  });
});

describe("keys", () => {
  it("resolves keyboard and mouse codes", () => {
    expect(keyForCode("KeyV")?.label).toBe("V");
    expect(keyForCode("Mouse4")).toBeTruthy();
    expect(keyForCode("Nope")).toBeUndefined();
  });
});
