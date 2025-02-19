import AutoSizer from "react-virtualized-auto-sizer";
import { ComputeUnits } from "../../../../api/types";
import { useMemo } from "react";
import {
  Line,
  XAxis,
  YAxis,
  LineChart,
  ReferenceLine,
  Legend,
  Tooltip,
} from "recharts";
import { Segment } from "recharts/types/cartesian/ReferenceLine";
import { useMedia } from "react-use";
import ChartTooltip from "./ChartTooltip";

interface ChartProps {
  computeUnits: ComputeUnits;
  bankTileCount: number;
}

interface ChartData {
  timestamp: number;
  computeUnits: number;
  activeBankCount: number;
}

function getData(computeUnits: ComputeUnits): ChartData[] {
  const dataMap: Map<
    number,
    {
      timestamp: number;
      computeUnits?: number;
      activeBankCount?: number;
    }
  > = new Map([
    [
      computeUnits.start_timestamp_nanos,
      { timestamp: computeUnits.start_timestamp_nanos, computeUnits: 0 },
    ],
    [
      computeUnits.target_end_timestamp_nanos,
      { timestamp: computeUnits.target_end_timestamp_nanos },
    ],
  ]);

  const computeUnitsCoors: { x: number; y: number }[] = [];
  for (let i = 0; i < computeUnits.compute_unit_timestamps_nanos.length; i++) {
    computeUnitsCoors.push({
      x: computeUnits.compute_unit_timestamps_nanos[i],
      y:
        computeUnits.compute_units_deltas[i] +
        (computeUnitsCoors[i - 1]?.y ?? 0),
    });
  }

  const dsComputeUnitsCoors = computeUnitsCoors; // simplify(computeUnitsCoors, 50_000);

  for (let i = 0; i < dsComputeUnitsCoors.length; i++) {
    const { x, y } = dsComputeUnitsCoors[i];
    let dataPoint = dataMap.get(x);

    if (!dataPoint) {
      dataPoint = { timestamp: x };
      dataMap.set(x, dataPoint);
    }

    dataPoint.computeUnits = y;
  }

  if (computeUnits.active_bank_count) {
    const activeBankCoors: { x: number; y: number }[] = [];
    for (
      let i = 0;
      i < computeUnits.compute_unit_timestamps_nanos.length;
      i++
    ) {
      activeBankCoors.push({
        x: computeUnits.compute_unit_timestamps_nanos[i],
        y: computeUnits.active_bank_count[i],
      });
    }

    const dsActiveBankCoors = activeBankCoors; // simplify(activeBankCoors);

    for (let i = 0; i < dsActiveBankCoors.length; i++) {
      const { x, y } = dsActiveBankCoors[i];
      let dataPoint = dataMap.get(x);

      if (!dataPoint) {
        dataPoint = { timestamp: x };
        dataMap.set(x, dataPoint);
      }

      dataPoint.activeBankCount = y;
    }
  }

  const data = [...dataMap]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map<ChartData>(([, dataPoint], i, arr) => {
      return {
        timestamp:
          (dataPoint.timestamp - computeUnits.start_timestamp_nanos) /
          1_000_000,
        computeUnits:
          dataPoint.computeUnits ?? arr[i - 1]?.[1]?.computeUnits ?? 0,
        activeBankCount:
          dataPoint.activeBankCount ?? arr[i - 1]?.[1]?.activeBankCount ?? 0,
      };
    })
    .flatMap<ChartData>((data, i, arr) => {
      const prevBankCount = arr[i - 1]?.activeBankCount;
      const bankChanged =
        prevBankCount !== undefined && prevBankCount !== data.activeBankCount;
      const prevComputeUnits = arr[i - 1]?.computeUnits;
      const computeUnitsChanged =
        prevComputeUnits !== undefined &&
        prevComputeUnits !== data.computeUnits;

      if (bankChanged || computeUnitsChanged) {
        return [
          {
            timestamp: data.timestamp,
            activeBankCount: prevBankCount,
            computeUnits: prevComputeUnits,
          },
          data,
        ];
      }

      return [data];
    });

  return data;
}

function getXAxisTicks(computeUnits: ComputeUnits, msInterval: number) {
  const maxMsTick = Math.max(
    Number(
      (computeUnits.target_end_timestamp_nanos -
        computeUnits.start_timestamp_nanos) /
        1_000_000
    ),
    computeUnits.compute_unit_timestamps_nanos.length
      ? (computeUnits.compute_unit_timestamps_nanos[
          computeUnits.compute_unit_timestamps_nanos.length - 1
        ] -
          computeUnits.start_timestamp_nanos) /
          1_000_000
      : 0
  );

  let msTick = 0;
  const ticks: number[] = [];
  while (msTick + 30 < maxMsTick) {
    ticks.push(msTick);
    msTick += msInterval;
  }

  ticks.push(maxMsTick);

  return ticks;
}

function getSegmentCus({
  x,
  bankCount,
  cusPerNs,
  tEnd,
  maxComputeUnits,
}: {
  x: number;
  bankCount: number;
  cusPerNs: number;
  tEnd: number;
  maxComputeUnits: number;
}) {
  return bankCount * cusPerNs * (x - tEnd) + maxComputeUnits;
}

const cusPerNs = 1 / 8;

function getSegments(computeUnits: ComputeUnits, bankTileCount: number) {
  const segments: Segment[][] = [];
  const tEnd =
    0.95 *
    Number(
      computeUnits.target_end_timestamp_nanos -
        computeUnits.start_timestamp_nanos
    );

  for (let i = 1; i <= bankTileCount; i++) {
    const xIntercept =
      (-computeUnits.max_compute_units / i / cusPerNs + tEnd) / 1_000_000;
    const x0Cus = getSegmentCus({
      x: 0,
      bankCount: i,
      cusPerNs,
      tEnd,
      maxComputeUnits: computeUnits.max_compute_units,
    });

    segments.push([
      x0Cus >= 0
        ? {
            x: 0,
            y: x0Cus,
          }
        : {
            x: xIntercept,
            y: 0,
          },
      {
        x: tEnd / 1_000_000,
        y: getSegmentCus({
          x: tEnd,
          bankCount: i,
          cusPerNs,
          tEnd,
          maxComputeUnits: computeUnits.max_compute_units,
        }),
      },
    ]);
  }
  return segments;
}

const segmentColors = ["#1E9C50", "#AE5511", "#CF321D", "#F40505"];

export default function Chart({ computeUnits, bankTileCount }: ChartProps) {
  const isWideScreen = useMedia("(min-width: 900px)");
  const isNarrowScreen = useMedia("(max-width: 600px)");

  const data = useMemo(() => getData(computeUnits), [computeUnits]);
  const activeBankCountTicks = new Array(bankTileCount)
    .fill(0)
    .map((_, i) => i + 1);

  const XAxisTicks = getXAxisTicks(
    computeUnits,
    isWideScreen ? 50 : !isNarrowScreen ? 100 : 200
  );
  const segments = getSegments(computeUnits, bankTileCount);

  return (
    <AutoSizer>
      {({ height, width }) => {
        return (
          <LineChart
            width={width}
            height={height}
            data={data}
            margin={{
              top: 10,
            }}
          >
            <Line
              yAxisId="activeBankCount"
              type="monotone"
              dataKey="activeBankCount"
              stroke="#BA7B1D"
              strokeWidth={0.3}
              dot={false}
              name="banks active"
              isAnimationActive={false}
            />
            {segments.map((segment, i) => {
              return (
                <ReferenceLine
                  key={i}
                  segment={segment}
                  stroke={
                    segmentColors[i] ?? segmentColors[segmentColors.length - 1]
                  }
                  strokeDasharray="3 3"
                  yAxisId="computeUnits"
                  strokeWidth={1}
                />
              );
            })}
            <ReferenceLine
              y={computeUnits.max_compute_units}
              stroke="#2a7edf"
              strokeDasharray="3 3"
              yAxisId="computeUnits"
              strokeWidth={0.4}
            />

            <Line
              yAxisId="computeUnits"
              type="monotone"
              dataKey="computeUnits"
              stroke="#1288F6"
              strokeWidth={1}
              dot={false}
              name="CUs"
              isAnimationActive={false}
            />
            <XAxis
              dataKey="timestamp"
              scale="time"
              type="number"
              interval={0}
              ticks={XAxisTicks}
              tickFormatter={(tick) =>
                typeof tick === "number" ? `${tick}ms` : `${tick}`
              }
            />
            <YAxis
              yAxisId="computeUnits"
              scale="linear"
              type="number"
              domain={[0, computeUnits.max_compute_units + 2_000_000]}
              ticks={[
                8_000_000, 16_000_000, 24_000_000, 32_000_000, 40_000_000,
                48_000_000,
              ]}
              minTickGap={0}
              tickFormatter={(tick) => {
                if (typeof tick !== "number") return "";

                if (tick !== 24_000_000 && tick !== 48_000_000) return "";
                return `${tick / 1_000_000}M`;
              }}
            />
            <YAxis
              yAxisId="activeBankCount"
              scale="linear"
              type="number"
              domain={[0, (dataMax: number) => dataMax + 1]}
              ticks={activeBankCountTicks}
              orientation="right"
              name="active bank tiles"
            />
            <Tooltip content={<ChartTooltip />} isAnimationActive={false} />
            <Legend />
          </LineChart>
        );
      }}
    </AutoSizer>
  );
}
