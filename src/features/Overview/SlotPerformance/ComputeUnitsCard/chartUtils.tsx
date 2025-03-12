import { Domain } from "./types";

export function extendDomain(
  [dataMin, dataMax]: Domain,
  extendPct = 5
): Domain {
  const halfRange = ((dataMax - dataMin) * (1 + extendPct / 100)) / 2;
  const midpoint = dataMin + (dataMax - dataMin) / 2;
  return [Math.trunc(midpoint - halfRange), Math.ceil(midpoint + halfRange)];
}

export function withinDomain([dataMin, dataMax]: Domain, ...values: number[]) {
  return values.some((value) => value >= dataMin && value <= dataMax);
}

export function prettyIntervals(
  xMin: number,
  xMax: number,
  intervals: number
): number[] {
  if (intervals === 0 || !Number.isFinite(xMin) || !Number.isFinite(xMax))
    return [];

  const xMinInt = Math.floor(xMin);
  const xMaxInt = Math.ceil(xMax);
  if (xMinInt === xMaxInt) return [xMinInt];

  const intervalDelta = prettyValue((xMaxInt - xMinInt) / intervals);
  if (intervalDelta === 0) return [xMinInt, xMaxInt];

  const minFactor = Math.floor(xMinInt / intervalDelta);
  const maxFactor = Math.ceil(xMaxInt / intervalDelta);
  const actualIntervals = maxFactor - minFactor;
  const resIntervals = Array(actualIntervals + 1)
    .fill(0)
    .map((_, ix) => (minFactor + ix) * intervalDelta)
    .filter((x) => x >= xMin && x <= xMax);

  if (resIntervals.length <= 1) {
    return [xMinInt, ...resIntervals, xMaxInt];
  }

  return resIntervals;
}

const prettyCutoff = 1.4;

function prettyValue(value: number): number {
  let base = Math.ceil(Math.abs(value));
  if (base === 0) return 0;

  let pow = 0;
  while (base > 10) {
    base /= 10;
    pow++;
  }
  while (base < 1) {
    base *= 10;
    pow--;
  }

  let prettyBase = Math.ceil(base / prettyCutoff);
  if (prettyBase > 5) prettyBase = 10;
  else if (prettyBase > 2) prettyBase = 5;

  // prettyBase is 1/2/5/10
  return prettyBase * Math.pow(10, pow) * Math.sign(value);
}

export function notEqual(a: number, b: number, tolerance = 0) {
  return Math.abs(a - b) > tolerance;
}
