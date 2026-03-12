import { Box } from "@radix-ui/themes";
import { useRef, useMemo } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { isDefined } from "../../../utils";

const strokeLineWidth = 2;

interface GossipHealthSparklinesProps {
  colors: string[];
  maxValue: number;
  history: number[][];
  capacity: number;
}

export default function GossipHealthSparklines({
  colors,
  maxValue,
  history,
  capacity,
}: GossipHealthSparklinesProps) {
  const sizeRefs = useRef<{ height: number; width: number }>();
  const maxValueRef = useRef(maxValue);
  maxValueRef.current = maxValue;

  const scaledPoints = useMemo(() => {
    if (!sizeRefs.current) return;
    if (!history.length) return;

    const { height, width } = sizeRefs.current;
    if (height < 0 || width < 0) return;

    const maxLength = capacity ?? history.length;
    const xRatio = maxLength > 1 ? width / (maxLength - 1) : 0;
    const xOffset = maxLength - history.length;

    const computedMax = Math.max(
      maxValueRef.current,
      Math.max(...history.flatMap((values) => values.filter(isDefined))),
    );

    const seriesCount = history[history.length - 1].length;

    const points = Array.from({ length: seriesCount }).map(
      () => new Array<{ x: number; y: number }>(),
    );

    for (let x = 0; x < history.length; x++) {
      for (let seriesIdx = 0; seriesIdx < seriesCount; seriesIdx++) {
        const value = history[x][seriesIdx];
        if (value === undefined) continue;

        points[seriesIdx].push({
          x: (xOffset + x) * xRatio,
          y:
            (1 - value / computedMax) * (height - strokeLineWidth) +
            strokeLineWidth / 2,
        });
      }
    }

    if (points[0]?.length === 0) return;

    return points.map((seriesPoints) =>
      seriesPoints.map(({ x, y }) => `${x},${y}`).join(" "),
    );
  }, [history, capacity]);

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
