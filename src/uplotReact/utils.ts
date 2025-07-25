/* eslint-disable @typescript-eslint/no-explicit-any */
import uPlot from "uplot";

type OptionsUpdateState = "keep" | "update" | "create";

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is
if (!Object.is) {
  Object.defineProperty(Object, "is", {
    value: (x: any, y: any) =>
      (x === y && (x !== 0 || 1 / x === 1 / y)) || (x !== x && y !== y),
  });
}

export const optionsUpdateState = (
  _lhs: uPlot.Options,
  _rhs: uPlot.Options,
): OptionsUpdateState => {
  const { width: lhsWidth, height: lhsHeight, ...lhs } = _lhs;
  const { width: rhsWidth, height: rhsHeight, ...rhs } = _rhs;

  let state: OptionsUpdateState = "keep";
  if (lhsHeight !== rhsHeight || lhsWidth !== rhsWidth) {
    state = "update";
  }
  if (Object.keys(lhs).length !== Object.keys(rhs).length) {
    return "create";
  }
  for (const k of Object.keys(lhs)) {
    if (!Object.is(lhs[k as keyof typeof lhs], rhs[k as keyof typeof rhs])) {
      state = "create";
      break;
    }
  }
  return state;
};

export const dataMatch = (
  lhs: uPlot.AlignedData,
  rhs: uPlot.AlignedData,
): boolean => {
  if (lhs.length !== rhs.length) {
    return false;
  }
  return lhs.every((lhsOneSeries, seriesIdx) => {
    const rhsOneSeries = rhs[seriesIdx];
    if (lhsOneSeries.length !== rhsOneSeries.length) {
      return false;
    }

    if (Array.isArray(lhsOneSeries)) {
      return lhsOneSeries.every(
        (value, valueIdx) => value === rhsOneSeries[valueIdx],
      );
    } else return;
  });
};

export function clamp(
  nRange: number,
  nMin: number,
  nMax: number,
  fRange: number,
  fMin: number,
  fMax: number,
) {
  if (nRange > fRange) {
    nMin = fMin;
    nMax = fMax;
  } else if (nMin < fMin) {
    nMin = fMin;
    nMax = fMin + nRange;
  } else if (nMax > fMax) {
    nMax = fMax;
    nMin = fMax - nRange;
  }

  return [nMin, nMax];
}
