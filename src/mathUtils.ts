export function logRatio(a: number, b: number, base = Math.E) {
  if (a === 0 || b === 0) {
    return 0;
  }
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
