import fs from "node:fs";

/** Debounced recursive watcher over the clip folders (fs.watch recursive works on Windows). */
export function watchDirs(dirs: string[], onChange: () => void, debounceMs = 300): () => void {
  let t: NodeJS.Timeout | null = null;
  const fire = () => {
    if (t) clearTimeout(t);
    t = setTimeout(onChange, debounceMs);
  };
  const watchers: fs.FSWatcher[] = [];
  for (const d of dirs) {
    try {
      fs.mkdirSync(d, { recursive: true });
      watchers.push(fs.watch(d, { recursive: true }, fire));
    } catch {
      /* folder not watchable; manual refresh still works */
    }
  }
  return () => {
    if (t) clearTimeout(t);
    watchers.forEach((w) => w.close());
  };
}
