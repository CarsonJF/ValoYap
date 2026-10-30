import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { migrateConfig, defaultConfig, type Config } from "@valoyap/shared";

/** Versioned JSON config with atomic writes. Corrupt files are backed up, never crash the app. */
export class ConfigStore extends EventEmitter {
  private cfg: Config = defaultConfig();
  constructor(private file: string) {
    super();
  }

  load(): Config {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
      this.cfg = migrateConfig(raw);
    } catch (e: any) {
      if (e?.code !== "ENOENT") {
        try {
          fs.copyFileSync(this.file, `${this.file}.corrupt-${Date.now()}`);
        } catch {}
      }
      this.cfg = defaultConfig();
    }
    return this.cfg;
  }

  get(): Config {
    return this.cfg;
  }

  update(mutator: (c: Config) => void): Config {
    const next = structuredClone(this.cfg);
    mutator(next);
    this.cfg = migrateConfig(next);
    this.save();
    this.emit("change", this.cfg);
    return this.cfg;
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.cfg, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
