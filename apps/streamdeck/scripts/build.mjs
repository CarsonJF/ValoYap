// Bundles the plugin and generates manifest, icons and per-device .streamDeckProfile packages.
import { build } from "esbuild";
import { zipSync, strToU8 } from "fflate";
import { deflateSync } from "node:zlib";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { manifest } from "./gen-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plugin = path.join(root, "com.carsonjf.valoyap.sdPlugin");
const tmp = path.join(root, ".build");
fs.mkdirSync(tmp, { recursive: true });

// 1) plugin bundle (ESM so top-level await works; Node 20 runtime inside Stream Deck)
await build({
  entryPoints: [path.join(root, "src/plugin.ts")], bundle: true, platform: "node", target: "node20", format: "esm",
  outfile: path.join(plugin, "bin/plugin.js"), sourcemap: true, minify: false,
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
fs.writeFileSync(path.join(plugin, "bin/package.json"), JSON.stringify({ type: "module" }));

// 2) layout (shared with runtime)
await build({ entryPoints: [path.join(root, "src/layout.ts")], bundle: true, format: "esm", platform: "node", outfile: path.join(tmp, "layout.mjs") });
const { DEVICE_PROFILES, profilePath, roleAt } = await import(pathToFileURL(path.join(tmp, "layout.mjs")).href);

// 3) manifest
fs.writeFileSync(path.join(plugin, "manifest.json"), JSON.stringify(manifest(DEVICE_PROFILES, profilePath), null, 2) + "\n");

// 4) flat PNG icons (no Riot art): navy field with a red bar
function png(size, fn) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = fn(x / size, y / size);
      raw.set([r, g, b, 255], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const NAVY = [15, 25, 35], RED = [255, 70, 85];
const mark = (u, v) => (u > 0.2 && u < 0.8 && Math.abs(v - 0.5 + (u - 0.5) * 0.6) < 0.09 ? RED : NAVY);
const icons = { "imgs/plugin/icon": 256, "imgs/plugin/category": 28, "imgs/actions/icon": 20, "imgs/actions/key": 72 };
for (const [name, size] of Object.entries(icons)) {
  fs.mkdirSync(path.dirname(path.join(plugin, name)), { recursive: true });
  fs.writeFileSync(path.join(plugin, `${name}.png`), png(size, mark));
  fs.writeFileSync(path.join(plugin, `${name}@2x.png`), png(size * 2, mark));
}

const stableId = (n) => { const h = crypto.createHash("sha1").update("valoyap:" + n).digest("hex").toUpperCase(); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-A${h.slice(17, 20)}-${h.slice(20, 32)}`; };
// 5) profiles: one .streamDeckProfile (zip) per device type
const act = (uuid, name, settings = null) => ({
  Name: name, Settings: settings, State: 0, UUID: uuid,
  States: [{ FFamily: "", FSize: "18", FStyle: "", FUnderline: "off", Image: "", Title: "", TitleAlignment: "middle", TitleColor: "#ece8e1", TitleShow: "" }],
});
const uuidFor = { clip: "com.carsonjf.valoyap.clip", prev: "com.carsonjf.valoyap.prev", next: "com.carsonjf.valoyap.next", back: "com.carsonjf.valoyap.back" };
const names = { clip: "Clip", prev: "Previous page", next: "Next page", back: "Back" };
fs.rmSync(path.join(plugin, "profiles"), { recursive: true, force: true });
for (const d of DEVICE_PROFILES) {
  const Actions = {};
  for (let r = 0; r < d.rows; r++) for (let c = 0; c < d.columns; c++) {
    const role = roleAt(d.columns, d.rows, c, r);
    Actions[`${c},${r}`] = act(uuidFor[role], names[role]);
  }
  const dir = `${stableId(d.name)}.sdProfile`;
  const m = { Actions, DeviceModel: d.model, InstalledByPluginUUID: "com.carsonjf.valoyap", Name: `ValoYap Soundboard ${d.name}`, PreconfiguredName: profilePath(d), Version: "1.0" };
  const out = path.join(plugin, `${profilePath(d)}.streamDeckProfile`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(zipSync({ [`${dir}/manifest.json`]: strToU8(JSON.stringify(m)) })));
}
console.log("built", path.relative(root, plugin));
