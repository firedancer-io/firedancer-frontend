// lodash number-function equivalents for this app's inputs (plain
// finite numbers); pinned by tests against lodash

export function clamp(value: number, lower: number, upper: number) {
  return Math.max(Math.min(value, upper), lower);
}

export function sum(values: readonly number[]) {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

export function mean(values: readonly number[]) {
  return sum(values) / values.length;
}

export function max(values: readonly number[]) {
  if (!values.length) return undefined;
  let result = -Infinity;
  for (const value of values) if (value > result) result = value;
  return result;
}

/** Decimal-shifted rounding, exact where n*10^p would lose precision */
function shift(value: number, precision: number, fn: (n: number) => number) {
  if (!precision) return fn(value);
  const [m0, e0] = `${value}e`.split("e");
  const shifted = fn(Number(`${m0}e${Number(e0) + precision}`));
  if (shifted === 0) return shifted; // keeps -0, dropped by `${}`
  const [m1, e1] = `${shifted}e`.split("e");
  return Number(`${m1}e${Number(e1) - precision}`);
}

export function round(value: number, precision = 0) {
  return shift(value, precision, Math.round);
}

export function ceil(value: number, precision = 0) {
  return shift(value, precision, Math.ceil);
}

/** Lowest insertion index keeping the (ascending) array sorted */
export function sortedIndex(array: readonly number[], value: number) {
  let low = 0;
  let high = array.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (array[mid] < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function logRatio(a: number, b: number, base = Math.E) {
  if (b === 0) return Infinity;
  if (a === 0) return 0;
  if (a <= 0 || b <= 0) {
    console.error(a, b);
    console.error("Logarithms are only defined for positive numbers.");
  }

  if (base === Math.E) {
    return Math.log(a) - Math.log(b);
  } else {
    return Math.log(a) / Math.log(base) - Math.log(b) / Math.log(base);
  }
}

export function logBase(value: number, base = Math.E) {
  if (base === Math.E) return Math.log(value);
  return Math.log(value) / Math.log(base);
}

export function logRatio2(a: number, b: number, base = Math.E) {
  if (a === 0 || b === 0) {
    return 0;
  }
  if (a <= 0 || b <= 0) {
    console.error(a, b);
    console.error("Logarithms are only defined for positive numbers.");
  }

  return logBase(a, base) / logBase(b, base);
}

export function safeDivide(a: number, b: number) {
  if (Math.trunc(a) !== a) {
    let count = 0;
    while (Math.trunc(a) !== a) {
      a *= 10;
      count++;
    }
    return a / (Math.pow(10, count) * b);
  } else {
    return a / b;
  }
}

export function clampNonZeroValue(value: number, lower: number, upper: number) {
  if (value === 0) return 0;
  return clamp(value, lower, upper);
}
