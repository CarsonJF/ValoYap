/**
 * Pure key-layout maths shared by the plugin runtime and the profile generator.
 * Keys are numbered row-major. The last three keys are controls (Prev, Next, Back); every key before them is a clip key.
 */
export interface DeviceProfile {
  /** SDK DeviceType enum value (see @elgato/schemas). */
  deviceType: number;
  name: string;
  columns: number;
  rows: number;
  /** DeviceModel written into the generated profile manifest. */
  model: string;
}

export const DEVICE_PROFILES: DeviceProfile[] = [
  { deviceType: 0, name: "Stream Deck", columns: 5, rows: 3, model: "20GBA9901" },
  { deviceType: 1, name: "Stream Deck Mini", columns: 3, rows: 2, model: "20GAI9901" },
  { deviceType: 2, name: "Stream Deck XL", columns: 8, rows: 4, model: "20GAT9902" },
  { deviceType: 7, name: "Stream Deck +", columns: 4, rows: 2, model: "20GBD9901" },
  { deviceType: 9, name: "Stream Deck Neo", columns: 4, rows: 2, model: "20GBJ9901" },
];

export const PROFILE_BASE = "ValoYap Soundboard";
export const profilePath = (p: DeviceProfile) => `profiles/${PROFILE_BASE} ${p.name}`;
export const profileFor = (deviceType: number) => DEVICE_PROFILES.find((p) => p.deviceType === deviceType);

export type KeyRole = "clip" | "prev" | "next" | "back";

/** Role of the key at (column,row) on a columns x rows grid. */
export function roleAt(columns: number, rows: number, column: number, row: number): KeyRole {
  const total = columns * rows;
  const i = row * columns + column;
  if (i === total - 1) return "back";
  if (i === total - 2) return "next";
  if (i === total - 3) return "prev";
  return "clip";
}

/** Number of clip keys per page (controls always occupy three keys). */
export const clipsPerPage = (columns: number, rows: number) => Math.max(0, columns * rows - 3);

/** Index of a clip key among clip keys (0-based, row-major), or -1 for control keys. */
export function clipKeyIndex(columns: number, rows: number, column: number, row: number): number {
  return roleAt(columns, rows, column, row) === "clip" ? row * columns + column : -1;
}

export const pageCount = (slots: number, perPage: number) => Math.max(1, Math.ceil(slots / Math.max(1, perPage)));
export const clampPage = (page: number, pages: number) => Math.min(Math.max(0, page), pages - 1);
