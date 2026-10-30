export interface KeyDef {
  code: string;
  label: string;
  vk: number;
  /** PS/2 set-1 scan code */
  scan: number;
  /** extended-key flag (arrow keys, right ctrl/alt, etc.) */
  ext?: boolean;
  kind: "key" | "mouse";
}

const keys: KeyDef[] = [];
const add = (code: string, label: string, vk: number, scan: number, ext = false) =>
  keys.push({ code, label, vk, scan, ext, kind: "key" });

[..."QWERTYUIOP"].forEach((c, i) => add(`Key${c}`, c, c.charCodeAt(0), 0x10 + i));
[..."ASDFGHJKL"].forEach((c, i) => add(`Key${c}`, c, c.charCodeAt(0), 0x1e + i));
[..."ZXCVBNM"].forEach((c, i) => add(`Key${c}`, c, c.charCodeAt(0), 0x2c + i));
[..."1234567890"].forEach((c, i) => add(`Digit${c}`, c, c.charCodeAt(0), 0x02 + i));
for (let i = 1; i <= 10; i++) add(`F${i}`, `F${i}`, 0x6f + i, 0x3a + i);
add("F11", "F11", 0x7a, 0x57);
add("F12", "F12", 0x7b, 0x58);
for (let i = 13; i <= 24; i++) add(`F${i}`, `F${i}`, 0x6f + i, i <= 15 ? 0x64 + (i - 13) : 0x67 + (i - 16));
add("ShiftLeft", "L-SHIFT", 0xa0, 0x2a);
add("ShiftRight", "R-SHIFT", 0xa1, 0x36);
add("ControlLeft", "L-CTRL", 0xa2, 0x1d);
add("ControlRight", "R-CTRL", 0xa3, 0x1d, true);
add("AltLeft", "L-ALT", 0xa4, 0x38);
add("AltRight", "R-ALT", 0xa5, 0x38, true);
add("Space", "SPACE", 0x20, 0x39);
add("Tab", "TAB", 0x09, 0x0f);
add("CapsLock", "CAPS", 0x14, 0x3a);
add("Backquote", "`", 0xc0, 0x29);
add("Minus", "-", 0xbd, 0x0c);
add("Equal", "=", 0xbb, 0x0d);
add("BracketLeft", "[", 0xdb, 0x1a);
add("BracketRight", "]", 0xdd, 0x1b);
add("Backslash", "\\", 0xdc, 0x2b);
add("Semicolon", ";", 0xba, 0x27);
add("Quote", "'", 0xde, 0x28);
add("Comma", ",", 0xbc, 0x33);
add("Period", ".", 0xbe, 0x34);
add("Slash", "/", 0xbf, 0x35);
[0x52, 0x4f, 0x50, 0x51, 0x4b, 0x4c, 0x4d, 0x47, 0x48, 0x49].forEach((s, i) => add(`Numpad${i}`, `NUM ${i}`, 0x60 + i, s));
add("NumpadMultiply", "NUM *", 0x6a, 0x37);
add("NumpadAdd", "NUM +", 0x6b, 0x4e);
add("NumpadSubtract", "NUM -", 0x6d, 0x4a);
add("NumpadDecimal", "NUM .", 0x6e, 0x53);
add("NumpadDivide", "NUM /", 0x6f, 0x35, true);
add("Insert", "INS", 0x2d, 0x52, true);
add("Delete", "DEL", 0x2e, 0x53, true);
add("Home", "HOME", 0x24, 0x47, true);
add("End", "END", 0x23, 0x4f, true);
add("PageUp", "PGUP", 0x21, 0x49, true);
add("PageDown", "PGDN", 0x22, 0x51, true);
add("ArrowUp", "UP", 0x26, 0x48, true);
add("ArrowLeft", "LEFT", 0x25, 0x4b, true);
add("ArrowRight", "RIGHT", 0x27, 0x4d, true);
add("ArrowDown", "DOWN", 0x28, 0x50, true);
keys.push({ code: "Mouse4", label: "MOUSE 4", vk: 0x05, scan: 0, kind: "mouse" });
keys.push({ code: "Mouse5", label: "MOUSE 5", vk: 0x06, scan: 0, kind: "mouse" });

export const KEYS: readonly KeyDef[] = keys;
const byCode = new Map(keys.map((k) => [k.code, k]));
export const keyForCode = (code: string): KeyDef | undefined => byCode.get(code);
