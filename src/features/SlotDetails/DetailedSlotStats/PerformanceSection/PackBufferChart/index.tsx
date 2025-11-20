import { selectedSlotAtom } from "../../../../Overview/SlotPerformance/atoms";
import { useAtomValue } from "jotai";
import { useSlotQueryResponseDetailed } from "../../../../../hooks/useSlotQuery";
import { useMemo, useState } from "react";
import type uPlot from "uplot";
import AutoSizer from "react-virtualized-auto-sizer";
import UplotReact from "../../../../../uplotReact/UplotReact";
import {
  chartAxisColor,
  nonVoteColor,
  slotStatusRed,
  tipsColor,
  votesColor,
} from "../../../../../colors";
import { timeScaleDragPlugin } from "../../../../Overview/SlotPerformance/TransactionBarsCard/scaleDragPlugin";
import { wheelZoomPlugin } from "../../../../../uplotReact/wheelZoomPlugin";
import { touchPlugin } from "../../../../../uplotReact/touchPlugin";
import { packBufferTooltipPlugin } from "./packBufferTooltipPlugin";
import PackBufferChartTooltip from "./PackBufferChartTooltip";
import { SlotDetailsSubSection } from "../../SlotDetailsSubSection";
import { Box } from "@radix-ui/themes";

const xScaleKey = "packX";
const yScaleKey = "packTxnsY";

export default function PackBufferChart() {
  const slot = useAtomValue(selectedSlotAtom);
  const response = useSlotQueryResponseDetailed(slot).response;
  const [tooltipDataIdx, setTooltipDataIdx] = useState<number>();
  const schedulerCounts = response?.scheduler_counts;

  const chartData = useMemo<uPlot.AlignedData | undefined>(() => {
    const startTimeNanos = response?.transactions?.start_timestamp_nanos;
    if (!schedulerCounts || !startTimeNanos) return;

    const data: [number[], number[], number[], number[], number[]] = [
      [],
      [],
      [],
      [],
      [],
    ];
    for (let i = 0; i < Math.min(schedulerCounts.length); i++) {
      data[0].push(Number(schedulerCounts[i].timestamp_nanos - startTimeNanos));
      data[1].push(schedulerCounts[i].regular);
      data[2].push(schedulerCounts[i].votes);
      data[3].push(schedulerCounts[i].conflicting);
      data[4].push(schedulerCounts[i].bundles);
    }
    return data;
  }, [response?.transactions?.start_timestamp_nanos, schedulerCounts]);

  const options = useMemo<uPlot.Options>(() => {
    return {
      width: 0,
      height: 0,
      drawOrder: ["axes", "series"] as uPlot.DrawOrderKey[],
      cursor: {},
      scales: {
        [xScaleKey]: {
          time: false,
        },
        [yScaleKey]: {},
      },
      axes: [
        {
          scale: xScaleKey,
          border: {
            show: true,
            width: 1 / devicePixelRatio,
          },
          stroke: chartAxisColor,
          grid: {
            width: 1 / devicePixelRatio,
          },
          ticks: {
            width: 1 / devicePixelRatio,
            stroke: chartAxisColor,
            size: 5,
          },
          size: 30,
          values: (self, ticks) => {
            return ticks.map((rawValue) => rawValue / 1_000_000 + "ms");
          },
          space: 100,
        },
        {
          scale: yScaleKey,
          border: {
            show: true,
            width: 1 / devicePixelRatio,
            stroke: chartAxisColor,
          },
          stroke: chartAxisColor,
          grid: {
            width: 1 / devicePixelRatio,
          },
          ticks: {
            width: 1 / devicePixelRatio,
            stroke: chartAxisColor,
            size: 5,
          },
          space: 50,
          size(self, values, axisIdx, cycleNum) {
            const axis = self.axes[axisIdx];
            // bail out, force convergence
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
            if (cycleNum > 1) return (axis as any)._size;
            let axisSize = axis.ticks?.size ?? 0 + (axis.gap ?? 0);
            // adding tick gap
            axisSize += 5;
            // find longest value
            const longestVal = (values ?? []).reduce(
              (acc, val) => (val.length > acc.length ? val : acc),
              "",
            );
            if (longestVal !== "") {
              self.ctx.font = axis.font?.[0] ?? "Inter Tight";
              axisSize +=
                self.ctx.measureText(longestVal).width / devicePixelRatio;
            }
            const px = Math.ceil(axisSize);
            return px;
          },
        },
      ],
      series: [
        { scale: xScaleKey },
        {
          label: "Regular",
          stroke: nonVoteColor,
          points: { show: false },
          width: 2 / devicePixelRatio,
          scale: yScaleKey,
        },
        {
          label: "Votes",
          stroke: votesColor,
          points: { show: false },
          width: 2 / devicePixelRatio,
          scale: yScaleKey,
        },
        {
          label: "Conflicting",
          stroke: slotStatusRed,
          points: { show: false },
          width: 2 / devicePixelRatio,
          scale: yScaleKey,
        },
        {
          label: "Bundles",
          stroke: tipsColor,
          points: { show: false },
          width: 2 / devicePixelRatio,
          scale: yScaleKey,
        },
      ],
      legend: { show: false },
      plugins: [
        timeScaleDragPlugin(),
        wheelZoomPlugin({ factor: 0.75 }),
        packBufferTooltipPlugin(setTooltipDataIdx),
        touchPlugin(),
      ],
    };
  }, []);

  if (!chartData) return;

  const tooltipData =
    tooltipDataIdx !== undefined
      ? schedulerCounts?.[tooltipDataIdx]
      : undefined;

  return (
    <SlotDetailsSubSection title="Pack Txns Buffer Utilization">
      <Box height="100%" minHeight="200px" minWidth="300px">
        <AutoSizer>
          {({ height, width }) => {
            options.width = width;
            options.height = height;
            return (
              <>
                <UplotReact
                  id="packBufferChart"
                  options={options}
                  data={chartData}
                />
              </>
            );
          }}
        </AutoSizer>
      </Box>
      <PackBufferChartTooltip data={tooltipData} />
    </SlotDetailsSubSection>
  );
}
