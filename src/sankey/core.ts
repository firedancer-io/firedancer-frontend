import { useMemo } from "react";

// Local stand-ins for the @nivo/core / @nivo/colors utilities the sankey
// fork used, matching nivo behavior for the configurations this app passes.

// dot-path subset of lodash get; this app's accessors are plain
// property names / dot paths
function get(datum: unknown, path: string): unknown {
  let current: unknown = datum;
  for (const part of path.split(".")) {
    if (current == null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export type Box = Partial<{
  top: number;
  right: number;
  bottom: number;
  left: number;
}>;

export interface Dimensions {
  width: number;
  height: number;
}

export type PropertyAccessor<Datum, Value> = string | ((datum: Datum) => Value);

export type ValueFormat<Value> = string | ((value: Value) => string);

export type OrdinalColorScaleConfig<Datum> =
  | { scheme: "nivo" }
  | readonly string[]
  | ((datum: Datum) => string);

// @nivo/colors categoricalColorSchemes.nivo
const nivoScheme = [
  "#e8c1a0",
  "#f47560",
  "#f1e15b",
  "#e8a838",
  "#61cdbb",
  "#97e3d5",
];

export function useDimensions(
  width: number,
  height: number,
  partialMargin: Box = {},
) {
  return useMemo(() => {
    const margin = {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      ...partialMargin,
    };
    return {
      margin,
      innerWidth: width - margin.left - margin.right,
      innerHeight: height - margin.top - margin.bottom,
      outerWidth: width,
      outerHeight: height,
    };
  }, [width, height, partialMargin]);
}

export function usePropertyAccessor<Datum, Value>(
  accessor: PropertyAccessor<Datum, Value>,
): (datum: Datum) => Value {
  return useMemo(
    () =>
      typeof accessor === "function"
        ? accessor
        : (datum: Datum) => get(datum, accessor) as Value,
    [accessor],
  );
}

export function useValueFormatter<Value>(
  format?: ValueFormat<Value>,
): (value: Value) => string {
  return useMemo(() => {
    if (typeof format === "function") return format;
    // d3-format strings are unused by this app's sankey
    return (value: Value) => `${String(value)}`;
  }, [format]);
}

// d3 scaleOrdinal semantics: colors assigned in first-seen key order,
// cycling through the palette
export function useOrdinalColorScale<Datum>(
  config: OrdinalColorScaleConfig<Datum>,
  identity: string,
): (datum: Datum) => string {
  return useMemo(() => {
    if (typeof config === "function") return config;
    const palette = Array.isArray(config) ? (config as string[]) : nivoScheme;
    const assigned = new Map<unknown, string>();
    return (datum: Datum) => {
      const key = get(datum, identity);
      let color = assigned.get(key);
      if (color === undefined) {
        color = palette[assigned.size % palette.length];
        assigned.set(key, color);
      }
      return color;
    };
  }, [config, identity]);
}
