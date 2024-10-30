import { useInterval, useMeasure } from "react-use";
import { useMemo, useState } from "react";
import { isDefined } from "../../../utils";

const dataCount = 160;

interface TileParkLineProps {
  value?: number;
  queryBusy?: number[];
}

export default function TileSparkLine({ value, queryBusy }: TileParkLineProps) {
  const [ref, { width, height }] = useMeasure<SVGSVGElement>();

  const [busyData, setBusyData] = useState<(number | undefined)[]>([]);

  useInterval(() => {
    if (queryBusy?.length) return;

    setBusyData((prev) => {
      const newState = [...prev, value];
      if (newState.length >= dataCount) {
        newState.shift();
      }
      return newState;
    });
  }, 10);

  const scaledDataPoints = useMemo(() => {
    const data = queryBusy ?? busyData;

    const xRatio = width / data.length;

    return data
      .map((d, i) => {
        if (d === undefined) return;

        return {
          x: i * xRatio,
          y: Math.trunc((1 - d) * height),
        };
      })
      .filter(isDefined);
  }, [queryBusy, busyData, width, height]);

  const points = scaledDataPoints.map(({ x, y }) => `${x},${y}`).join(" ");

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width="100%"
      height="20px"
      fill="none"
      style={{ background: "#232A38", padding: "2px 0" }}
    >
      <polyline
        points={points}
        stroke="url(#paint0_linear_2971_11300)"
        widths={2}
        strokeWidth={2}
        strokeLinecap="round"
      />

      <defs>
        <linearGradient
          id="paint0_linear_2971_11300"
          x1="59.5"
          y1="20"
          x2="59.5"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#55BA83" />
          <stop offset="1" stopColor="#D94343" />
        </linearGradient>
      </defs>
    </svg>
  );
}
