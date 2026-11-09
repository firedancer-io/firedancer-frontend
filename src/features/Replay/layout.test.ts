import { describe, expect, it } from "vitest";
import {
  getRowsLayout,
  getTrackHeights,
  getTrackSharesPct,
  minTrackPx,
  TRACK_GAP_PX,
  TRACK_TITLE_PX,
  trackInsetPx,
  type TrackId,
} from "./layout";

const allTracks: TrackId[] = [
  "shreds",
  "votes",
  "income",
  "banks",
  "replay",
  "cpu",
];
const tracksWithoutVotes = allTracks.filter((id) => id !== "votes");
const sum = (heights: Partial<Record<TrackId, number>>) =>
  Object.values(heights).reduce((a, b) => a + (b ?? 0), 0);

// height of the tracks area that leaves `freePx` for the tracks themselves
const areaFor = (freePx: number, tracks = allTracks.length) =>
  freePx + TRACK_GAP_PX * (tracks - 1);

describe("getTrackSharesPct", () => {
  it("uses the base shares", () => {
    expect(getTrackSharesPct(10, 2)).toEqual({
      shreds: 22,
      votes: 16,
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
    expect(shares.votes).toBeCloseTo(16 * scale);
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
  // the spec's 1181px window leaves 1000px for 6 tracks
  const spec = {
    shreds: 220,
    votes: 160,
    income: 140,
    banks: 300,
    replay: 100,
    cpu: 80,
  };

  it("matches the spec sizes, banks in whole rows", () => {
    const heights = getTrackHeights({
      heightPx: areaFor(1000),
      tracks: allTracks,
      hidden: new Set(),
      banksRows: 10,
      cpuRows: 2,
    });
    // 300px floors to 12 + 10 * 28; shreds takes the 8px left over
    expect(heights).toEqual({ ...spec, shreds: 228, banks: 292 });
  });

  it("gives votes' share to the other tracks when votes is absent", () => {
    const heights = getTrackHeights({
      heightPx: areaFor(910, tracksWithoutVotes.length),
      tracks: tracksWithoutVotes,
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
    const shreds = Math.floor((917 * 22) / 100);
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
      (53 * 14) / 100,
      -0.5,
    );
  });

  it("treats zero banks rows as one", () => {
    const heights = getTrackHeights({
      heightPx: areaFor(1000),
      tracks: allTracks,
      hidden: new Set(),
      banksRows: 0,
      cpuRows: 2,
    });
    expect(heights.banks).toBe(300);
    expect(sum(heights)).toBe(1000);
  });

  it("keeps every visible track at its minimum when banks and cpu are capped", () => {
    const heights = getTrackHeights({
      heightPx: 500,
      tracks: allTracks,
      hidden: new Set(),
      banksRows: 16,
      cpuRows: 18,
    });
    for (const id of allTracks) {
      expect(heights[id]).toBeGreaterThanOrEqual(minTrackPx[id]);
    }
    expect(sum(heights)).toBe(500 - (allTracks.length - 1) * TRACK_GAP_PX);
    expect(((heights.banks ?? 0) - trackInsetPx.banks) % 16).toBe(0);
  });

  it("keeps votes at its minimum when its share is smaller", () => {
    const heights = getTrackHeights({
      heightPx: areaFor(500),
      tracks: allTracks,
      hidden: new Set(),
      banksRows: 16,
      cpuRows: 18,
    });
    expect(heights.votes).toBe(minTrackPx.votes);
    expect(sum(heights)).toBe(500);
  });

  it("keeps every track at its minimum when the tracks only just fit", () => {
    for (const tracks of [allTracks, tracksWithoutVotes]) {
      const free = tracks.reduce((total, id) => total + minTrackPx[id], 0);
      const heights = getTrackHeights({
        heightPx: areaFor(free, tracks.length),
        tracks,
        hidden: new Set(),
        banksRows: 10,
        cpuRows: 2,
      });
      for (const id of tracks) {
        expect(heights[id]).toBeGreaterThanOrEqual(minTrackPx[id]);
      }
      expect(sum(heights)).toBe(free);
    }
    // the .fill-viewport floor in app.css is sized for this sum
    expect(sum(minTrackPx)).toBe(256);
  });

  it("fills the space and keeps minimums for random sizes, rows and hidden tracks", () => {
    let seed = 1;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    let allHiddenRuns = 0;
    let scaledRuns = 0;
    for (let i = 0; i < 2000; i++) {
      const tracks = random() < 0.5 ? allTracks : tracksWithoutVotes;
      const hidden = new Set(tracks.filter(() => random() < 0.3));
      const visible = tracks.filter((id) => !hidden.has(id));
      const banksRows = Math.floor(random() * 40);
      const heightPx = random() * 900;
      const heights = getTrackHeights({
        heightPx,
        tracks,
        hidden,
        banksRows,
        cpuRows: Math.floor(random() * 20),
      });

      const titlesPx = TRACK_TITLE_PX * hidden.size;
      for (const id of hidden) expect(heights[id]).toBe(TRACK_TITLE_PX);
      if (!visible.length) {
        allHiddenRuns++;
        expect(sum(heights)).toBe(titlesPx);
        continue;
      }

      const tracksPx = Math.max(
        0,
        Math.floor(heightPx) - TRACK_GAP_PX * (tracks.length - 1) - titlesPx,
      );
      expect(sum(heights)).toBe(tracksPx + titlesPx);

      const minsPx = visible.reduce((total, id) => total + minTrackPx[id], 0);
      const minScale = Math.min(1, tracksPx / minsPx);
      if (minScale < 1) scaledRuns++;
      const leftoverId = visible.includes("shreds") ? "shreds" : visible[0];
      const banksRoundingPx = Math.max(banksRows, 1) - 1;
      for (const id of visible) {
        const px = heights[id] ?? -1;
        const minPx = minTrackPx[id] * minScale;
        expect(Number.isInteger(px)).toBe(true);
        if (id === leftoverId) {
          expect(px).toBeGreaterThanOrEqual(Math.floor(minPx));
        } else if (id === "banks") {
          expect(px).toBeGreaterThanOrEqual(
            Math.floor(minPx) - banksRoundingPx,
          );
          if (minScale < 1) expect(px).toBeLessThanOrEqual(minPx);
        } else if (minScale === 1) {
          expect(px).toBeGreaterThanOrEqual(minPx);
        } else {
          expect(px).toBeGreaterThan(minPx - 1);
          expect(px).toBeLessThanOrEqual(minPx);
        }
      }
    }
    expect(allHiddenRuns).toBeGreaterThan(0);
    expect(scaledRuns).toBeGreaterThan(100);
  });

  it("scales every minimum down together when the tracks can't all fit them", () => {
    const heights = getTrackHeights({
      heightPx: areaFor(128),
      tracks: allTracks,
      hidden: new Set(),
      banksRows: 10,
      cpuRows: 2,
    });
    expect(heights.votes).toBe(minTrackPx.votes / 2);
    expect(heights.income).toBe(minTrackPx.income / 2);
    expect(sum(heights)).toBe(128);
  });

  it("never goes negative when tracks can't all fit their minimums", () => {
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
    expect(sum(heights)).toBe(100 - (allTracks.length - 1) * TRACK_GAP_PX);
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
