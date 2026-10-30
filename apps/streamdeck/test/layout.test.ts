import { describe, expect, it } from "vitest";
import { DEVICE_PROFILES, clampPage, clipKeyIndex, clipsPerPage, pageCount, roleAt } from "../src/layout";

describe("layout", () => {
  it("reserves the last three keys for prev/next/back", () => {
    expect(roleAt(5, 3, 4, 2)).toBe("back");
    expect(roleAt(5, 3, 3, 2)).toBe("next");
    expect(roleAt(5, 3, 2, 2)).toBe("prev");
    expect(roleAt(5, 3, 1, 2)).toBe("clip");
  });
  it("counts clip keys for every shipped device", () => {
    for (const d of DEVICE_PROFILES) {
      let clips = 0;
      for (let r = 0; r < d.rows; r++) for (let c = 0; c < d.columns; c++) if (roleAt(d.columns, d.rows, c, r) === "clip") clips++;
      expect(clips).toBe(clipsPerPage(d.columns, d.rows));
    }
  });
  it("wraps controls onto the correct row on a 3x2 Mini", () => {
    expect([0, 1, 2].map((c) => roleAt(3, 2, c, 1))).toEqual(["prev", "next", "back"]);
    expect(clipKeyIndex(3, 2, 2, 0)).toBe(2);
    expect(clipKeyIndex(3, 2, 2, 1)).toBe(-1);
  });
  it("pages", () => {
    expect(pageCount(0, 12)).toBe(1);
    expect(pageCount(13, 12)).toBe(2);
    expect(clampPage(5, 2)).toBe(1);
    expect(clampPage(-1, 2)).toBe(0);
  });
});
