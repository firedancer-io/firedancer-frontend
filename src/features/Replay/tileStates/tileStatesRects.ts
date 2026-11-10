export const MAX_COVERAGE_STATES = 6;

// normalized values are in [0, 1]
export type BarLayout = [name: string, itemSize: number, normalized: boolean][];

const NORMALIZED_MAX = 2 ** 16 - 1;

export const tileStatesBarLayout: BarLayout = [
  ["instanceRow", 1, false],
  ["instanceSharesLo", 4, true],
  ["instanceSharesHi", MAX_COVERAGE_STATES - 4, true],
];

export const errorStatesBarLayout: BarLayout = [["instanceBar", 2, false]];

/** Each bar value's scale, the row first */
export function getBarScales(barLayout: BarLayout) {
  return barLayout.flatMap(([, itemSize, normalized]) =>
    new Array<number>(itemSize).fill(normalized ? NORMALIZED_MAX : 1),
  );
}

/** Instance data of rects */
export interface Rects {
  edges: Float32Array; // [startHi, startLo, endHi, endLo] per rect in ms from referenceX
  bar: Uint16Array; // [row, ...values] per rect, interleaved by a bar layout
  barScales: number[];
  slot: Float32Array; // slot per rect
  referenceX: number; // The data tile's start in ms
}

/** Sets a rect's edges and row, and returns where its bar values start */
function setRect(
  rects: Rects,
  idx: number,
  startMs: number,
  endMs: number,
  row: number,
  slot: number,
) {
  const { edges, referenceX } = rects;
  const localStart = startMs - referenceX;
  const localEnd = endMs - referenceX;
  const startHi = Math.fround(localStart);
  const endHi = Math.fround(localEnd);
  const r = idx * 4;
  edges[r] = startHi;
  edges[r + 1] = localStart - startHi;
  edges[r + 2] = endHi;
  edges[r + 3] = localEnd - endHi;
  rects.slot[idx] = slot;
  const b = idx * rects.barScales.length;
  rects.bar[b] = row;
  return b + 1;
}

// bar values after the row are values[valuesOffset...] * valuesScale
export function addRect(
  rects: Rects,
  idx: number,
  startMs: number,
  endMs: number,
  row: number,
  slot: number,
  values: ArrayLike<number>,
  valuesOffset = 0,
  valuesScale = 1,
) {
  const first = setRect(rects, idx, startMs, endMs, row, slot);
  const { bar, barScales } = rects;
  for (let i = 1; i < barScales.length; i++) {
    bar[first + i - 1] = Math.round(
      values[valuesOffset + i - 1] * valuesScale * barScales[i],
    );
  }
}

/** Sets a rect whose only bar value is a normalized 1 at valueIdx */
export function addOneHotRect(
  rects: Rects,
  idx: number,
  startMs: number,
  endMs: number,
  row: number,
  slot: number,
  valueIdx: number,
) {
  const first = setRect(rects, idx, startMs, endMs, row, slot);
  const { bar, barScales } = rects;
  for (let i = 1; i < barScales.length; i++) bar[first + i - 1] = 0;
  bar[first + valueIdx] = NORMALIZED_MAX;
}
