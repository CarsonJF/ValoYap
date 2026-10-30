import { describe, expect, it } from "vitest";
import { WindowsKeyInjector } from "../src";

// Opt-in: VALOYAP_LIVE_INJECT=1 sends a harmless key-UP for an unheld key (F24) through SendInput.
describe.runIf(process.env.VALOYAP_LIVE_INJECT === "1" && process.platform === "win32")("live SendInput", () => {
  it("calls SendInput through koffi without throwing", () => {
    const inj = new WindowsKeyInjector();
    expect(() => inj.up("F24", "scancode")).not.toThrow();
    expect(() => inj.up("Mouse4", "scancode")).not.toThrow();
  });
});
