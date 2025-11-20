import { Box } from "@radix-ui/themes";
import { useRef, useState, useEffect, useMemo } from "react";
import { useHarmonicIntervalFn } from "react-use";
import AutoSizer from "react-virtualized-auto-sizer";
import { isDefined } from "../../../utils";

const updateInterval = 150;
const timeFrame = 30_000;
const bufferMax = Math.trunc(timeFrame / updateInterval);
const strokeLineWidth = 2;

interface GossipHealthSparklinesProps {
  colors: string[];
  values: number[];
  maxValue: number;
}

export default function GossipHealthSparklines({
  values,
  colors,
  maxValue,
}: GossipHealthSparklinesProps) {
  const sizeRefs = useRef<{ height: number; width: number }>();
  // [xIdx][seriesIdx]
  const [chartData, setChartData] = useState<(number | undefined)[][]>([]);
  const seriesCount = values.length;
  // Want to use the latest max but not update the paths when max changes
  const maxValueRef = useRef(maxValue);
  maxValueRef.current = maxValue;
  const hasInitRef = useRef(false);

  useEffect(() => {
    // start with populating an empty array so path starts drawing from the right
    setChartData(
      Array.from({ length: bufferMax }).map((_, i) => {
        return Array.from({ length: seriesCount });
      }),
    );
  }, [seriesCount]);

  useHarmonicIntervalFn(() => {
    if (!hasInitRef.current && values.every((value) => !value)) {
      return;
    }
    hasInitRef.current = true;
    setChartData((prev) => {
      let chartData = [...prev];
      if (prev.length > bufferMax) {
        chartData = chartData.slice(chartData.length - bufferMax);
      }
      chartData.push(values);
      return chartData;
    });
  }, updateInterval);

  const scaledPoints = useMemo(() => {
    if (!sizeRefs.current) return;
    if (!chartData.length) return;

    const { height, width } = sizeRefs.current;
    if (height < 0 || width < 0) return;

    const maxLength = chartData.length;
    const xRatio = width / maxLength;

    const maxValue = Math.max(
      maxValueRef.current,
      Math.max(...chartData.flatMap((value) => value.filter(isDefined))),
    );

    const seriesCount = chartData[0].length;

    const points = Array.from({ length: seriesCount }).map(
      () => new Array<{ x: number; y: number }>(),
    );

    for (let x = 0; x < chartData.length; x++) {
      for (let seriesIdx = 0; seriesIdx < chartData[x].length; seriesIdx++) {
        const value = chartData[x][seriesIdx];
        if (value === undefined) continue;

        points[seriesIdx].push({
          x: x * xRatio,
          y:
            (1 - value / maxValue) * (height - strokeLineWidth) +
            strokeLineWidth / 2,
        });
      }
    }

    if (points[0]?.length === 0) return;

    return points.map((seriesPoints) =>
      seriesPoints.map(({ x, y }) => `${x},${y}`).join(" "),
    );
  }, [chartData]);

  return (
    <Box flexGrow="1" minHeight="80px">
      <AutoSizer>
        {({ height, width }) => {
          sizeRefs.current = { height, width };
          if (!scaledPoints) return;
          if (scaledPoints?.length !== colors.length) return;
          return (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width={width}
              height={height}
              style={{ background: "#222222" }}
            >
              {scaledPoints.map((points, i) => (
                <polyline
                  key={colors[i]}
                  points={points}
                  stroke={colors[i]}
                  strokeWidth={strokeLineWidth}
                  fill="none"
                  strokeLinecap="round"
                  strokeOpacity={0.8}
                />
              ))}
            </svg>
          );
        }}
      </AutoSizer>
    </Box>
  );
}
