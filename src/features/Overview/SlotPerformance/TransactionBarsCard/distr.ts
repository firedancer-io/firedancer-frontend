/* eslint-disable @typescript-eslint/no-explicit-any */
function roundDec(val: number, dec: number) {
  return Math.round(val * (dec = 10 ** dec)) / dec;
}

export const SPACE_BETWEEN = 1;
export const SPACE_AROUND = 2;
export const SPACE_EVENLY = 3;

const coord = (
  i: number,
  offs: number,
  iwid: number,
  scaledIwid: number,
  gap: number,
) => {
  // if (i > 2) {
  //   return roundDec(offs + (i-2) * (scaledIwid + gap) + (iwid + gap), 6);
  // }
  return roundDec(offs + i * (iwid + gap), 6);
};

export function distr(
  numItems: number,
  sizeFactor: number,
  justify: number,
  onlyIdx: number | null,
  each: {
    (groupIdx: number, groupOffPct: number, groupDimPct: number): void;
    (barIdx: number, barOffPct: number, barDimPct: any): void;
    (di: any, lftPct: number, widPct: number): void;
    (arg0: number, arg1: number, arg2: number): void;
  },
) {
  const space = 1 - sizeFactor;

  let gap =
    justify === SPACE_BETWEEN
      ? space / (numItems - 1)
      : justify === SPACE_AROUND
        ? space / numItems
        : justify === SPACE_EVENLY
          ? space / (numItems + 1)
          : 0;

  if (isNaN(gap) || gap === Infinity) gap = 0;

  const offs =
    justify === SPACE_BETWEEN
      ? 0
      : justify === SPACE_AROUND
        ? gap / 2
        : justify === SPACE_EVENLY
          ? gap
          : 0;

  const iwid = sizeFactor / numItems;
  const _iwid = roundDec(iwid, 6);

  const firstItemWeight = 3; // First item is 1.5x larger than others
  const firstItemWidth =
    (sizeFactor / (numItems - 1 + firstItemWeight)) * firstItemWeight;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const otherItemsWidth = (sizeFactor - firstItemWidth) / (numItems - 1);
  const _firstItemWidth = _iwid; // roundDec(firstItemWidth, 6);
  const _otherItemsWidth = _iwid; // roundDec(otherItemsWidth, 6);

  if (onlyIdx == null) {
    for (let i = 0; i < numItems; i++) {
      const currentWidth = i < 2 ? _firstItemWidth : _otherItemsWidth; // Halve size for onlyIdx if it > 2
      each(
        i,
        coord(i, offs, _firstItemWidth, _otherItemsWidth, gap),
        currentWidth,
      );
    }
    // for (let i = 0; i < numItems; i++)
    //   each(i, coord(i, offs, iwid, gap), _iwid);
  } else {
    const currentWidth = onlyIdx < 2 ? _firstItemWidth : _otherItemsWidth; // Halve size for onlyIdx if it > 2

    each(
      onlyIdx,
      coord(onlyIdx, offs, _firstItemWidth, _otherItemsWidth, gap),
      currentWidth,
    );
  }
}
