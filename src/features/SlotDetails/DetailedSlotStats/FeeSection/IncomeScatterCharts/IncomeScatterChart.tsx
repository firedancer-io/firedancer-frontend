import { useMemo, useState } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import {
  chartAxisColor,
  incomePerCuToggleControlColor,
} from "../../../../../colors";
import UplotReact from "../../../../../uplotReact/UplotReact";
import { lamportsScaleKey } from "../../../../Overview/SlotPerformance/ComputeUnitsCard/consts";
import { hexToRgba } from "../../../../../colorUtils";
import { Box } from "@radix-ui/themes";
import type uPlot from "uplot";
import { compactZeroDecimalFormatter } from "../../../../../numUtils";
import { lamportsPerSol } from "../../../../../consts";
import { incomeScatterTooltipPlugin } from "./incomeScatterTooltipPlugin";
import IncomeScatterChartTooltip from "./IncomeScatterChartTooltip";
import { incomeChartPointRadius } from "../../consts";

interface CuIncomeScatterChartProps {
  data: uPlot.AlignedData;
  id: string;
  xLogScale?: boolean;
  xScaleOptions?: {
    scaledToX: (scaled: number, negMin: number, posMax: number) => number;
    negMin: number;
    posMax: number;
  };
  xLabel: string;
  xColor?: string;
  formatX: (x: number) => string;
}

const xScaleKey = "cuX";

export default function IncomeScatterChart({
  data,
  id,
  xLogScale = false,
  xScaleOptions,
  xLabel,
  xColor,
  formatX,
}: CuIncomeScatterChartProps) {
  const tooltipElId = `${id}-tooltip`;
  const [tooltipData, setTooltipData] = useState<{ x: number; y: number }>();

  const options = useMemo(() => {
    return {
      width: 0,
      height: 0,
      padding: [10, 15, 0, 15],
      scales: {
        [xScaleKey]: {
          time: false,
          distr: xLogScale ? 3 : undefined,
        },
        [lamportsScaleKey]: {
          time: false,
          distr: 3,
        },
      },

      axes: [
        {
          scale: xScaleKey,
          border: {
            show: true,
            width: 1 / devicePixelRatio,
            stroke: chartAxisColor,
          },
          stroke: chartAxisColor,
          grid: {
            show: false,
          },
          values: (self, ticks) => {
            return ticks.map((rawValue) => {
              if (xScaleOptions) {
                const { scaledToX, negMin, posMax } = xScaleOptions;
                return Math.round(
                  scaledToX(rawValue, negMin, posMax),
                ).toLocaleString();
              }

              return rawValue
                ? compactZeroDecimalFormatter.format(rawValue)
                : rawValue;
            });
          },
          size: 20,
          gap: 0,
          font: "8px Inter Tight",
        },
        {
          scale: lamportsScaleKey,
          stroke: chartAxisColor,
          grid: {
            show: false,
          },
          border: {
            show: true,
            width: 1 / devicePixelRatio,
            stroke: chartAxisColor,
          },
          show: false,
        },
      ],
      series: [
        {
          scale: xScaleKey,
        },
        {
          scale: lamportsScaleKey,
          stroke: undefined,
          points: {
            show: true,
            size: incomeChartPointRadius * 2,
            fill: hexToRgba(incomePerCuToggleControlColor, 0.3),
            space: 0,
          },
        },
      ],
      legend: { show: false },
      hooks: {
        draw: [
          (u) => {
            u.ctx.save();
            u.ctx.fillStyle = chartAxisColor;
            u.ctx.font = "18px Inter Tight";
            u.ctx.textAlign = "left";

            u.ctx.fillText(
              `${(u.scales[lamportsScaleKey]?.max ?? 0) / lamportsPerSol} SOL`,
              0,
              0,
            );
            u.ctx.restore();
          },
        ],
      },
      plugins: [
        incomeScatterTooltipPlugin(
          tooltipElId,
          xScaleKey,
          lamportsScaleKey,
          setTooltipData,
        ),
      ],
    } satisfies uPlot.Options;
  }, [tooltipElId, xLogScale, xScaleOptions]);

  return (
    <>
      <Box flexGrow="1">
        <AutoSizer>
          {({ height, width }) => {
            options.width = width;
            options.height = height;
            return <UplotReact id={id} options={options} data={data} />;
          }}
        </AutoSizer>
      </Box>
      <IncomeScatterChartTooltip
        elId={tooltipElId}
        data={tooltipData}
        xLabel={xLabel}
        xColor={xColor}
        tooltipFormatX={formatX}
      />
    </>
  );
}
