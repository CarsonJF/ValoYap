import type { Clip, ClipSource, ResolvedClip } from "./types";
import type { Config } from "./config";

export const SHARED = "shared";
export const normalizeName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const natural = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/**
 * Build the ordered clip list for an agent (or "shared"):
 * the agent's own clips, then shared clips (if enabled), ordered by saved order,
 * unsaved ones after in a stable default order. Disabled clips get key 0.
 */
export function resolveClips(
  viewKey: string,
  all: Clip[],
  cfg: Pick<Config, "clips">,
  filter?: { source?: ClipSource; includeDisabled?: boolean },
): ResolvedClip[] {
  const include = (c: Clip) =>
    (c.agentKey === viewKey || (viewKey !== SHARED && cfg.clips.includeShared && c.agentKey === SHARED)) &&
    (!filter?.source || c.source === filter.source);
  const pool = all.filter(include);
  const saved = cfg.clips.order[viewKey] ?? [];
  const rank = new Map(saved.map((id, i) => [id, i]));
  const defaultRank = (c: Clip) =>
    (c.agentKey === SHARED ? 2 : 0) + (c.source === "user" ? 1 : 0);
  pool.sort((a, b) => {
    const ra = rank.get(a.id), rb = rank.get(b.id);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return defaultRank(a) - defaultRank(b) || natural.compare(a.defaultTitle, b.defaultTitle);
  });
  const ov = cfg.clips.overrides[viewKey] ?? {};
  let key = 0;
  const out: ResolvedClip[] = pool.map((c) => {
    const o = ov[c.id];
    const enabled = o?.enabled ?? true;
    return {
      ...c,
      title: o?.title?.trim() || c.defaultTitle,
      enabled,
      volume: o?.volume ?? 1,
      key: enabled ? ++key : 0,
    };
  });
  return filter?.includeDisabled === false ? out.filter((c) => c.enabled) : out;
}

/** Move a clip within the saved order (used by the reorder buttons). */
export function reorder(currentIds: string[], id: string, delta: -1 | 1): string[] {
  const i = currentIds.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= currentIds.length) return currentIds;
  const next = currentIds.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
