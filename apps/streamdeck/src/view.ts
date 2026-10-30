import type { SdSlot, SdStateMessage } from "@valoyap/shared";
import { clampPage, clipKeyIndex, clipsPerPage, pageCount, roleAt, type KeyRole } from "./layout";

export interface KeyView {
  role: KeyRole;
  title: string;
  image: string;
  /** clip bound to this key on the current page, if any */
  clipId?: string;
}

const NAVY = "#0f1923";
const OFF_WHITE = "#ece8e1";
const RED = "#ff4655";
const MUTED = "#7b8a97";

const svg = (body: string, bg = NAVY) =>
  "data:image/svg+xml;charset=utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" fill="${bg}"/>${body}</svg>`,
  );

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Wrap a clip title to at most 2 lines of ~11 characters. */
export function wrapTitle(title: string, width = 11, lines = 2): string {
  const words = title.trim().split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= width) cur = (cur + " " + w).trim();
    else {
      if (cur) out.push(cur);
      cur = w.length > width ? w.slice(0, width - 1) + "…" : w;
    }
    if (out.length === lines) break;
  }
  if (cur && out.length < lines) out.push(cur);
  return out.slice(0, lines).join("\n");
}

const empty = (role: KeyRole): KeyView => ({ role, title: "", image: svg("") });

export function keyView(
  state: SdStateMessage | null,
  columns: number,
  rows: number,
  column: number,
  row: number,
  page: number,
): KeyView {
  const role = roleAt(columns, rows, column, row);
  if (!state) return { ...empty(role), title: role === "clip" ? "" : "", image: svg(`<text x="72" y="84" font-size="22" text-anchor="middle" fill="${MUTED}" font-family="Impact,sans-serif">OFFLINE</text>`) };
  const per = clipsPerPage(columns, rows);
  const pages = pageCount(state.slots.length, per);
  const p = clampPage(page, pages);

  if (role === "back") {
    const icon = state.agent.iconDataUrl;
    return {
      role,
      title: icon ? "" : "BACK",
      image: icon
        ? svg(`<image href="${icon}" x="0" y="0" width="144" height="144" opacity="0.55"/><text x="72" y="132" font-size="26" text-anchor="middle" fill="${OFF_WHITE}" font-family="Impact,sans-serif">BACK</text>`)
        : svg(`<text x="72" y="84" font-size="30" text-anchor="middle" fill="${OFF_WHITE}" font-family="Impact,sans-serif">BACK</text>`),
    };
  }
  if (role === "prev" || role === "next") {
    const enabled = pages > 1;
    const color = enabled ? OFF_WHITE : MUTED;
    const d = role === "prev" ? "M92 40 L52 72 L92 104 Z" : "M52 40 L92 72 L52 104 Z";
    return {
      role,
      title: "",
      image: svg(`<path d="${d}" fill="${color}"/><text x="72" y="130" font-size="22" text-anchor="middle" fill="${MUTED}" font-family="Impact,sans-serif">${p + 1}/${pages}</text>`),
    };
  }

  const slot: SdSlot | undefined = state.slots[p * per + clipKeyIndex(columns, rows, column, row)];
  if (!slot) return empty(role);
  const playing = state.playback.clipId === slot.clipId && state.playback.phase !== "idle";
  const fg = playing ? NAVY : OFF_WHITE;
  return {
    role,
    clipId: slot.clipId,
    title: "",
    image: svg(
      `<text x="12" y="52" font-size="44" fill="${playing ? NAVY : RED}" font-family="Impact,sans-serif">${slot.key}</text>` +
        wrapTitle(slot.title)
          .split("\n")
          .map((l, i, a) => `<text x="12" y="${(a.length === 1 ? 108 : 94) + i * 24}" font-size="20" fill="${fg}" font-family="Segoe UI,sans-serif" font-weight="600">${esc(l)}</text>`)
          .join(""),
      playing ? RED : NAVY,
    ),
  };
}
