import AutoSizer from "react-virtualized-auto-sizer";
import { useMemo, useRef } from "react";
import { isDefined } from "../../../utils";

interface ChartProps {
  nonVotes: number[];
  votes: number[];
  failed: number[];
  maxTps: number;
}

export default function Chart({ nonVotes, votes, failed, maxTps }: ChartProps) {
  const sizeRefs = useRef<{ height: number; width: number }>();

  const scaledPaths = useMemo(() => {
    if (!sizeRefs.current) return;

    const { height, width } = sizeRefs.current;
    const maxLength = Math.max(nonVotes.length, votes.length, failed.length);
    const xRatio = width / maxLength;
    const yRatio = height / maxTps;

    const votePoints = votes
      .map((t, i) => {
        if (t === undefined) return;

        return {
          x: i * xRatio,
          y: t * yRatio,
        };
      })
      .filter(isDefined);

    const failedPoints = failed
      .map((t, i) => {
        if (t === undefined) return;
        const val = t + (votes[i] ?? 0);

        return {
          x: i * xRatio,
          y: Math.max(val * yRatio, votePoints[i]?.y ?? 0 + 1),
        };
      })
      .filter(isDefined);

    const nonVotePoints = nonVotes.map((t, i) => {
      if (t === undefined) return;
      const val = t + (votes[i] ?? 0) + (failed[i] ?? 0);

      return {
        x: i * xRatio,
        y: Math.max(val * yRatio, failedPoints[i]?.y ?? 0 + 1),
      };
    });

    const getPath = (points: { x: number; y: number }[]) => {
      if (!points.length) return "";

      const path = points.map(({ x, y }) => `L ${x} ${height - y}`).join(" ");

      return (
        "M" +
        path.slice(1) +
        `L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height}, L ${points[0].x} ${points[0].y}`
      );
    };

    return {
      votePath: getPath(votePoints.filter(isDefined)),
      failedPath: getPath(failedPoints.filter(isDefined)),
      nonVotePath: getPath(nonVotePoints.filter(isDefined)),
    };
  }, [failed, maxTps, nonVotes, votes]);

  if (nonVotes.length < 10 && votes.length < 10 && failed.length < 10)
    return null;

  return (
    <AutoSizer>
      {({ height, width }) => {
        sizeRefs.current = { height, width };
        if (!scaledPaths) return null;
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={width}
            height={height}
            fill="none"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d={scaledPaths.nonVotePath}
              fill="#006851"
            />
            <path d={scaledPaths.failedPath} fill="#743F4D" />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              fill="#19307C"
              d={scaledPaths.votePath}
            />
          </svg>
        );
      }}
    </AutoSizer>
  );
}
