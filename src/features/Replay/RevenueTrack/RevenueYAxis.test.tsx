import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import RevenueYAxis from "./RevenueYAxis";
import styles from "../chart.module.css";

afterEach(cleanup);

function renderAxis(height: number) {
  const { container } = render(
    <RevenueYAxis
      height={height}
      maxValue={1_000_000_000n}
      scale="linear"
      splitRows={false}
      numRows={1}
    />,
  );
  return {
    gridLines: container.getElementsByClassName(styles.yAxisGridLine).length,
    valueLabels: Array.from(
      container.getElementsByClassName(styles.yAxisTickPrefix),
    ).filter((prefix) => prefix.textContent !== "≤").length,
  };
}

describe("RevenueYAxis", () => {
  it("draws all 5 grid lines when the track is tall", () => {
    expect(renderAxis(200).gridLines).toBe(5);
  });

  it("drops grid lines as the track gets shorter", () => {
    expect(renderAxis(88).gridLines).toBe(4);
    expect(renderAxis(87).gridLines).toBe(3);
  });

  it("keeps a value label above the floor label on a short track", () => {
    const { gridLines, valueLabels } = renderAxis(40);
    expect(gridLines).toBe(3);
    expect(valueLabels).toBe(1);
  });
});
