import { createRequire } from "node:module";
import { keyForCode, type KeyDef } from "@valoyap/shared";

export interface KeyInjector {
  down(code: string, method: "scancode" | "vk"): void;
  up(code: string, method: "scancode" | "vk"): void;
}

const KEYEVENTF_EXTENDEDKEY = 0x1;
const KEYEVENTF_KEYUP = 0x2;
const KEYEVENTF_SCANCODE = 0x8;
const MOUSEEVENTF_XDOWN = 0x80;
const MOUSEEVENTF_XUP = 0x100;

/** Builds the dwFlags / wVk / wScan triple for a keyboard SendInput. Pure, tested. */
export function keyboardInputFor(def: KeyDef, up: boolean, method: "scancode" | "vk") {
  let flags = up ? KEYEVENTF_KEYUP : 0;
  if (def.ext) flags |= KEYEVENTF_EXTENDEDKEY;
  if (method === "scancode") {
    flags |= KEYEVENTF_SCANCODE;
    return { wVk: 0, wScan: def.scan, dwFlags: flags };
  }
  return { wVk: def.vk, wScan: def.scan, dwFlags: flags };
}

/**
 * SendInput via koffi. Windows only. Input injected this way carries the
 * LLKHF_INJECTED flag; whether Valorant honours it is the open question in docs/PTT_SPIKE.md.
 */
export class WindowsKeyInjector implements KeyInjector {
  private send: ((input: unknown) => number) | null = null;

  private init(): (input: unknown) => number {
    if (this.send) return this.send;
    const require = typeof __filename !== "undefined" ? createRequire(__filename) : createRequire(import.meta.url);
    const koffi = require("koffi");
    const user32 = koffi.load("user32.dll");
    const MOUSEINPUT = koffi.struct("MOUSEINPUT", {
      dx: "long", dy: "long", mouseData: "uint32", dwFlags: "uint32", time: "uint32", dwExtraInfo: "uintptr",
    });
    const KEYBDINPUT = koffi.struct("KEYBDINPUT", {
      wVk: "uint16", wScan: "uint16", dwFlags: "uint32", time: "uint32", dwExtraInfo: "uintptr",
    });
    const INPUT = koffi.struct("INPUT", {
      type: "uint32",
      u: koffi.union("INPUT_U", { mi: MOUSEINPUT, ki: KEYBDINPUT }),
    });
    const SendInput = user32.func("uint32 __stdcall SendInput(uint32 cInputs, INPUT *pInputs, int cbSize)");
    const size = koffi.sizeof(INPUT);
    this.send = (input) => SendInput(1, [input], size);
    return this.send;
  }

  private fire(code: string, up: boolean, method: "scancode" | "vk"): void {
    const def = keyForCode(code);
    if (!def) throw new Error(`Unknown PTT key: ${code}`);
    const send = this.init();
    if (def.kind === "mouse") {
      const mi = {
        dx: 0, dy: 0, mouseData: code === "Mouse4" ? 1 : 2,
        dwFlags: up ? MOUSEEVENTF_XUP : MOUSEEVENTF_XDOWN, time: 0, dwExtraInfo: 0,
      };
      send({ type: 0, u: { mi } });
      return;
    }
    const k = keyboardInputFor(def, up, method);
    send({ type: 1, u: { ki: { ...k, time: 0, dwExtraInfo: 0 } } });
  }

  down(code: string, method: "scancode" | "vk"): void {
    this.fire(code, false, method);
  }
  up(code: string, method: "scancode" | "vk"): void {
    this.fire(code, true, method);
  }
}
