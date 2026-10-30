import fs from "node:fs";

export interface TailerOptions {
  /** Poll interval for the file size (a cheap stat, not an API poll). */
  pollMs?: number;
  /** Feed the existing file contents first (to learn current state + GLZ URL). */
  replayExisting?: boolean;
}

/** Tails a growing text file; survives truncation/rotation (game restart). */
export class LogTailer {
  private offset = 0;
  private partial = "";
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private birth = 0;

  constructor(
    private file: string,
    private onLine: (line: string) => void,
    private opts: TailerOptions = {},
  ) {}

  start(): void {
    if (this.timer) return;
    if (!this.opts.replayExisting) {
      try {
        this.offset = fs.statSync(this.file).size;
      } catch {
        this.offset = 0;
      }
    }
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.opts.pollMs ?? 500);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Exposed for tests. */
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      let size: number;
      try {
        const st = await fs.promises.stat(this.file);
        size = st.size;
        if (this.birth && st.birthtimeMs !== this.birth) {
          this.offset = 0; // file replaced (new game session)
          this.partial = "";
        }
        this.birth = st.birthtimeMs;
      } catch {
        this.offset = 0;
        this.partial = "";
        return;
      }
      if (size < this.offset) {
        this.offset = 0; // truncated / replaced by a new session
        this.partial = "";
      }
      if (size === this.offset) return;
      const fh = await fs.promises.open(this.file, "r");
      try {
        const len = size - this.offset;
        const buf = Buffer.alloc(len);
        await fh.read(buf, 0, len, this.offset);
        this.offset = size;
        const text = this.partial + buf.toString("utf8");
        const lines = text.split(/\r?\n/);
        this.partial = lines.pop() ?? "";
        for (const l of lines) if (l) this.onLine(l);
      } finally {
        await fh.close();
      }
    } finally {
      this.busy = false;
    }
  }
}
