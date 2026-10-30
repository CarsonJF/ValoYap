import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  external: ["electron", "koffi"],
  logLevel: "info",
};
await build({ ...common, entryPoints: ["src/main/index.ts"], outfile: "dist/main/index.cjs" });
await build({ ...common, entryPoints: ["src/preload/index.ts"], outfile: "dist/preload/index.cjs" });
