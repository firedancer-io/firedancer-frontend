import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Pie } from "@nivo/pie";
import { arc as d3Arc, pie as d3Pie } from "d3-shape";
import { PieChartContent, type ComputedDatum } from "../PieChart";

// Geometry equivalence against @nivo/pie (test-only import): same d3-shape
// arcs in insertion order, same fills, same arc-label placement.

type Datum = {
  id: string;
  label: string;
  value: number;
  color: string;
};

const datasets: { name: string; data: Datum[] }[] = [
  {
    name: "three slices",
    data: [
      { id: "used", label: "Used", value: 61_000, color: "#48295C" },
      { id: "frag", label: "Fragmentation", value: 9_500, color: "#562800" },
      { id: "unused", label: "Unused", value: 29_500, color: "#132D21" },
    ],
  },
  {
    name: "unsorted slices incl. zero",
    data: [
      { id: "a", label: "A", value: 5, color: "#111111" },
      { id: "b", label: "B", value: 95, color: "#222222" },
      { id: "c", label: "C", value: 0, color: "#333333" },
      { id: "d", label: "D", value: 40, color: "#444444" },
    ],
  },
  {
    name: "single slice",
    data: [{ id: "all", label: "All", value: 1, color: "#abcdef" }],
  },
];

function svgPaths(container: HTMLElement) {
  return Array.from(container.querySelectorAll("path"))
    .map((p) => ({
      d: p.getAttribute("d"),
      fill: p.getAttribute("fill"),
    }))
    .filter((p) => p.d);
}

describe("PieChartContent matches @nivo/pie geometry", () => {
  for (const { name, data } of datasets) {
    for (const innerRadius of [0.7, 0]) {
      it(`${name}, innerRadius ${innerRadius}`, () => {
        const width = 300;
        const height = 200;
        const size = Math.min(width, height);
        const margin = {
          top: 0,
          right: (width - size) / 2,
          bottom: height - size,
          left: (width - size) / 2,
        };

        const nivo = render(
          <Pie
            height={height}
            width={width}
            margin={margin}
            data={data}
            colors={(d) => d.data.color}
            layers={["arcs"]}
            animate={false}
            innerRadius={innerRadius}
          />,
        );
        const mine = render(
          <PieChartContent
            height={height}
            width={width}
            data={data}
            innerRadius={innerRadius}
          />,
        );

        const nivoPaths = svgPaths(nivo.container);
        const minePaths = svgPaths(mine.container);
        expect(nivoPaths.length).toBeGreaterThan(0);
        expect(minePaths).toEqual(nivoPaths);

        // both must equal raw d3-shape output (nivo's own generator)
        const radius = size / 2;
        const arcs = d3Pie<Datum>()
          .value((d) => d.value)
          .sortValues(null)(data);
        const gen = d3Arc<(typeof arcs)[number]>()
          .innerRadius(radius * innerRadius)
          .outerRadius(radius);
        expect(minePaths.map((p) => p.d)).toEqual(arcs.map((a) => gen(a)));

        nivo.unmount();
        mine.unmount();
      });
    }
  }

  it("arc labels match nivo text and placement", () => {
    const data = datasets[1].data;
    const width = 200;
    const height = 200;

    const nivo = render(
      <Pie
        height={height}
        width={width}
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        data={data}
        colors={(d) => d.data.color}
        layers={["arcs", "arcLabels"]}
        enableArcLabels
        arcLabelsSkipAngle={10}
        arcLabelsTextColor="#9F9F9F"
        arcLabel={(d) => d.data.label}
        animate={false}
        innerRadius={0.7}
      />,
    );
    const mine = render(
      <PieChartContent
        height={height}
        width={width}
        data={data}
        innerRadius={0.7}
        enableArcLabels
        arcLabelsSkipAngle={10}
        arcLabelsTextColor="#9F9F9F"
        arcLabel={(d) => d.data.label}
      />,
    );

    // nivo puts the translate on a parent <g>; the static renderer puts it
    // on the <text> itself
    const texts = (c: HTMLElement) =>
      Array.from(c.querySelectorAll("text")).map((t) => ({
        label: t.textContent,
        at: (
          t.getAttribute("transform") ??
          t.parentElement?.getAttribute("transform") ??
          ""
        ).replace(/translate\(|\)/g, ""),
      }));

    const nivoTexts = texts(nivo.container);
    const mineTexts = texts(mine.container);
    expect(mineTexts.map((t) => t.label)).toEqual(
      nivoTexts.map((t) => t.label),
    );
    // compare coordinates numerically (nivo may emit "x,y" vs "x, y")
    const coords = (at: string) =>
      at.split(",").map((v) => Math.round(parseFloat(v) * 100) / 100);
    for (let i = 0; i < mineTexts.length; i++) {
      expect(coords(mineTexts[i].at)).toEqual(coords(nivoTexts[i].at));
    }

    nivo.unmount();
    mine.unmount();
  });

  it("exposes nivo-shaped computed datums to the centered metric layer", () => {
    let seen: readonly ComputedDatum<Datum>[] = [];
    let geom: { centerX: number; centerY: number; ir: number; r: number } = {
      centerX: 0,
      centerY: 0,
      ir: 0,
      r: 0,
    };
    render(
      <PieChartContent
        height={200}
        width={300}
        data={datasets[0].data}
        innerRadius={0.7}
        centeredMetric={({
          dataWithArc,
          centerX,
          centerY,
          innerRadius,
          radius,
        }) => {
          seen = dataWithArc;
          geom = { centerX, centerY, ir: innerRadius, r: radius };
          return null;
        }}
      />,
    );
    expect(seen.map((d) => d.id)).toEqual(["used", "frag", "unused"]);
    expect(seen[0].label).toBe("Used");
    expect(seen[0].value).toBe(61_000);
    expect(seen[0].data.color).toBe("#48295C");
    expect(seen[0].arc.startAngle).toBe(0);
    expect(geom).toEqual({ centerX: 150, centerY: 100, ir: 70, r: 100 });
  });
});
