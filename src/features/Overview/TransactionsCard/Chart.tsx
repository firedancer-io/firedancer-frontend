import AutoSizer from "react-virtualized-auto-sizer";
import { useMemo, useRef } from "react";
import { isDefined } from "../../../utils";
import { useAtomValue } from "jotai";
import { tpsDataAtom } from "./atoms";

const getPath = (points: { x: number; y: number }[], height: number) => {
  if (!points.length) return "";

  const path = points.map(({ x, y }) => `L ${x} ${height - y}`).join(" ");

  return (
    "M" +
    path.slice(1) +
    `L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height}, L ${points[0].x} ${points[0].y}`
  );
};

export default function Chart() {
  const tpsData = useAtomValue(tpsDataAtom);
  const sizeRefs = useRef<{ height: number; width: number }>();

  const maxTotalTps = Math.max(...tpsData.map((d) => d?.total ?? 0));

  const scaledPaths = useMemo(() => {
    if (!sizeRefs.current) return;
    if (!tpsData.length) return;

    const { height, width } = sizeRefs.current;
    const maxLength = tpsData.length;
    const xRatio = (width + 2) / maxLength;
    const yRatio = (height - 10) / (maxTotalTps || 1);

    const points = tpsData
      .map((d, i) => {
        if (d === undefined) return;

        return {
          x: i * xRatio,
          voteY: d.vote * yRatio,
          nonvoteFailedY: (d.nonvote_failed + d.vote) * yRatio,
          nonvoteY: (d.nonvote_success + d.nonvote_failed + d.vote) * yRatio,
        };
      })
      .filter(isDefined);

    const maxTotalY = height - maxTotalTps * yRatio;

    return {
      votePath: getPath(
        points.map((p) => ({ x: p.x, y: p.voteY })),
        height,
      ),
      failedPath: getPath(
        points.map((p) => ({ x: p.x, y: p.nonvoteFailedY })),
        height,
      ),
      nonvotePath: getPath(
        points.map((p) => ({ x: p.x, y: p.nonvoteY })),
        height,
      ),
      totalTpsY: isNaN(maxTotalY) ? undefined : maxTotalY,
    };
  }, [maxTotalTps, tpsData]);

  return (
    <>
      <AutoSizer>
        {({ height, width }) => {
          sizeRefs.current = { height, width };
          if (!scaledPaths) return null;
          return (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={width}
                height={height}
                fill="none"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d={scaledPaths.nonvotePath}
                  fill="#006851"
                />
                <path d={scaledPaths.failedPath} fill="#743F4D" />
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  fill="#19307C"
                  d={scaledPaths.votePath}
                />

                {scaledPaths.totalTpsY && (
                  <>
                    <line
                      x1="0"
                      y1={scaledPaths.totalTpsY}
                      x2={width}
                      y2={scaledPaths.totalTpsY}
                      strokeDasharray="4"
                      stroke="rgba(255, 255, 255, 0.30)"
                    />
                    <text
                      x="0"
                      y={scaledPaths.totalTpsY - 3}
                      fill="#8E909D"
                      fontSize="8"
                      fontFamily="Inter-Tight"
                    >
                      {maxTotalTps.toLocaleString()}
                    </text>
                  </>
                )}
              </svg>
            </>
          );
        }}
      </AutoSizer>
    </>
  );
}
