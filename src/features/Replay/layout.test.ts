import { describe, expect, it } from "vitest";
import {
  getRowsLayout,
  getTrackHeights,
  getTrackSharesPct,
  TRACK_GAP_PX,
  TRACK_TITLE_PX,
  trackInsetPx,
  type TrackId,
} from "./layout";

const allTracks: TrackId[] = ["shreds", "income", "banks", "replay", "cpu"];
const sum = (heights: Partial<Record<TrackId, number>>) =>
  Object.values(heights).reduce((a, b) => a + (b ?? 0), 0);

// height of the tracks area that leaves `freePx` for the tracks themselves
const areaFor = (freePx: number, tracks = allTracks.length) =>
  freePx + TRACK_GAP_PX * (tracks - 1);

describe("getTrackSharesPct", () => {
  it("uses the base shares", () => {
    expect(getTrackSharesPct(10, 2)).toEqual({
      shreds: 22,
      income: 14,
      banks: 30,
      replay: 10,
      cpu: 8,
    });
  });

  it("grows banks by 3% per execrp tile over 10 and scales the rest down", () => {
    const shares = getTrackSharesPct(12, 2);
    expect(shares.banks).toBe(36);
    expect(shares.cpu).toBe(8);
    const scale = (100 - 36 - 8) / 62;
    expect(shares.shreds).toBeCloseTo(22 * scale);
    expect(shares.income).toBeCloseTo(14 * scale);
    expect(shares.replay).toBeCloseTo(10 * scale);
  });

  it("caps banks and cpu at 45%", () => {
    expect(getTrackSharesPct(64, 2).banks).toBe(45);
    expect(getTrackSharesPct(10, 40).cpu).toBe(45);
  });

  it("grows cpu by 3% per row over 2", () => {
    expect(getTrackSharesPct(10, 4).cpu).toBe(14);
  });
});

describe("getTrackHeights", () => {
  it("splits by share, banks in whole rows", () => {
    const heights = getTrackHeights({
      heightPx: areaFor(910),
      tracks: allTracks,
      hidden: new Set(),
      banksRows: 10,
      cpuRows: 2,
    });
    // 325px floors to 12 + 10 * 31; shreds takes the 5px left over
    expect(heights).toEqual({
      shreds: 243,
      income: 151,
      banks: 322,
      replay: 108,
      cpu: 86,
    });
  });

  it("rounds banks down to whole rows and gives shreds the leftover", () => {
    const heights = getTrackHeights({
      heightPx: areaFor(917),
      tracks: allTracks,
      hidden: new Set(),
      banksRows: 7,
      cpuRows: 2,
    });
    expect(((heights.banks ?? 0) - trackInsetPx.banks) % 7).toBe(0);
    expect(sum(heights)).toBe(917);
    const shreds = Math.floor((917 * 22) / 84);
    expect(heights.shreds).toBeGreaterThan(shreds);
  });

  it("shrinks hidden tracks to their title bar and scales up the rest", () => {
    const shown = getTrackHeights({
      heightPx: areaFor(910),
      tracks: allTracks,
      hidden: new Set(),
      banksRows: 10,
      cpuRows: 2,
    });
    const hidden = getTrackHeights({
      heightPx: areaFor(910),
      tracks: allTracks,
      hidden: new Set<TrackId>(["income"]),
      banksRows: 10,
      cpuRows: 2,
    });
    expect(hidden.income).toBe(TRACK_TITLE_PX);
    expect(sum(hidden)).toBe(910);
    expect(hidden.cpu).toBeGreaterThan(shown.cpu ?? 0);
    expect((hidden.replay ?? 0) / (hidden.cpu ?? 1)).toBeCloseTo(10 / 8, 1);
  });

  it("gives leftover pixels to the first visible track when shreds is hidden", () => {
    const heights = getTrackHeights({
      heightPx: areaFor(911),
      tracks: allTracks,
      hidden: new Set<TrackId>(["shreds"]),
      banksRows: 3,
      cpuRows: 2,
    });
    expect(heights.shreds).toBe(TRACK_TITLE_PX);
    expect(sum(heights)).toBe(911);
  });

  it("shares extra height in the same proportions", () => {
    const base = { tracks: allTracks, hidden: new Set<TrackId>() };
    const small = getTrackHeights({
      ...base,
      heightPx: areaFor(910),
      banksRows: 10,
      cpuRows: 2,
    });
    const large = getTrackHeights({
      ...base,
      heightPx: areaFor(963),
      banksRows: 10,
      cpuRows: 2,
    });
    expect((large.income ?? 0) - (small.income ?? 0)).toBeCloseTo(
      (53 * 14) / 84,
      -0.5,
    );
  });

  it("treats zero banks rows as one", () => {
    const heights = getTrackHeights({
      heightPx: areaFor(910),
      tracks: allTracks,
      hidden: new Set(),
      banksRows: 0,
      cpuRows: 2,
    });
    expect(heights.banks).toBe(325);
    expect(sum(heights)).toBe(910);
  });

  it("keeps every visible track at least 40px when banks and cpu are capped", () => {
    const heights = getTrackHeights({
      heightPx: 500,
      tracks: allTracks,
      hidden: new Set(),
      banksRows: 16,
      cpuRows: 18,
    });
    for (const id of allTracks) {
      expect(heights[id]).toBeGreaterThanOrEqual(40);
    }
    expect(sum(heights)).toBe(500 - 4 * TRACK_GAP_PX);
    expect(((heights.banks ?? 0) - trackInsetPx.banks) % 16).toBe(0);
  });

  it("never goes negative when tracks can't all fit 40px", () => {
    const heights = getTrackHeights({
      heightPx: 100,
      tracks: allTracks,
      hidden: new Set(),
      banksRows: 10,
      cpuRows: 2,
    });
    for (const id of allTracks) {
      expect(heights[id]).toBeGreaterThanOrEqual(0);
    }
    expect(sum(heights)).toBe(100 - 4 * TRACK_GAP_PX);
  });

  it("only includes present tracks", () => {
    const tracks: TrackId[] = ["shreds", "income", "banks", "replay"];
    const heights = getTrackHeights({
      heightPx: areaFor(500, tracks.length),
      tracks,
      hidden: new Set(),
      banksRows: 10,
      cpuRows: 2,
    });
    expect(heights.cpu).toBeUndefined();
    expect(sum(heights)).toBe(500);
  });
});

describe("getRowsLayout", () => {
  it("shrinks the row gap so dense rows stay inside the track", () => {
    const { topPx, rowPx, gapPx } = getRowsLayout(240, 256, {
      insetPx: 24,
      fillWhenThin: true,
      gapPx: 2,
    });
    expect(gapPx).toBeLessThan(2);
    expect(topPx + 256 * rowPx + 255 * gapPx).toBeCloseTo(240);
  });

  it("places rows under the title", () => {
    expect(getRowsLayout(124, 4, { insetPx: 24 })).toEqual({
      topPx: 24,
      rowPx: 25,
      gapPx: 0,
      labelStep: 1,
    });
  });

  it("fills the whole track when rows would be too thin under the title", () => {
    expect(getRowsLayout(40, 2, { insetPx: 24, fillWhenThin: true })).toEqual({
      topPx: 0,
      rowPx: 20,
      gapPx: 0,
      labelStep: 1,
    });
    expect(getRowsLayout(40, 2, { insetPx: 24 }).topPx).toBe(24);
  });

  it("labels every 2nd row when rows are under 13px", () => {
    expect(getRowsLayout(12 + 10 * 12, 12, { insetPx: 12 }).labelStep).toBe(2);
    expect(getRowsLayout(12 + 13 * 12, 12, { insetPx: 12 }).labelStep).toBe(1);
  });

  it("accounts for row gaps", () => {
    expect(
      getRowsLayout(24 + 2 * 24 + 2, 2, { insetPx: 24, gapPx: 2 }).rowPx,
    ).toBe(24);
  });
});
