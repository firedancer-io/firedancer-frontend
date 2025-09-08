import { memo, useEffect, useState } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { useCallback, useMemo, useRef } from "react";
import UplotReact from "../../../uplotReact/UplotReact";
import { useInterval } from "react-use";
import styles from "./snapshot.module.css";
import { appTeal, snapshotAreaChartDark } from "../../../colors";
import simplify from "simplify-js";

const initialChartData: [number[], (number | null)[]] = [[], []];

interface SnapshotAreaChartProps {
  chartId: string;
  value?: number | null;
  total?: number | null;
  pctComplete?: number;
}

export default function SnapshotAreaChart({
  chartId,
  value,
  total,
  pctComplete,
}: SnapshotAreaChartProps) {
  const uplotRef = useRef<uPlot>();
  const [chartData, setChartData] = useState<
    {
      x: number;
      y: number;
    }[]
  >([]);

  useInterval(() => {
    if (pctComplete === 100 || value == null) return;

    setChartData((prev) => {
      return [
        ...prev,
        {
          x: new Date().getTime(),
          y: value,
        },
      ];
    });
  }, 10);

  useEffect(() => {
    if (!total) return;
    requestAnimationFrame(() => {
      const simplified = simplify(chartData, Math.trunc(total / 50000000));
      const data = simplified.reduce(
        (acc, { x, y }) => {
          acc[0].push(x);
          acc[1].push(y);
          return acc;
        },
        [[], []] as [number[], number[]],
      );
      uplotRef.current?.setData(data);
    });
  }, [chartData, total]);

  return (
    <div className={styles.areaChartGridContainer}>
      <div
        className={styles.areaChartScale}
        style={{
          transform: `scaleX(${pctComplete}%)`,
        }}
      >
        {total && <MPlot chartId={chartId} total={total} uplotRef={uplotRef} />}
      </div>
    </div>
  );
}

interface PlotProps {
  chartId: string;
  total: number;
  uplotRef: React.MutableRefObject<uPlot | undefined>;
}

function Plot({ chartId, total, uplotRef }: PlotProps) {
  const options = useMemo<uPlot.Options>(() => {
    return {
      width: 0,
      height: 0,
      scales: {
        x: {
          time: false,
        },
        y: {
          auto: false,
          range: [0, total],
        },
      },
      padding: [0, 0, 0, 0],
      axes: [
        {
          show: false,
        },
        {
          show: false,
        },
      ],
      legend: {
        show: false,
      },
      drag: {
        mode: null,
      },
      cursor: {
        show: false,
        x: false,
        y: false,
      },
      series: [
        {},
        {
          type: "area",
          fill: (u) => {
            const gradient = u.ctx.createLinearGradient(0, 0, u.width, 0);
            gradient.addColorStop(0, snapshotAreaChartDark);
            gradient.addColorStop(1, appTeal);
            return gradient;
          },
          spanGaps: true,
          points: {
            show: false,
          },
        },
      ],
    };
  }, [total]);

  const handleCreate = useCallback(
    (u: uPlot) => {
      uplotRef.current = u;
    },
    [uplotRef],
  );

  return (
    <AutoSizer>
      {({ height, width }) => {
        options.width = width;
        options.height = height;
        return (
          <UplotReact
            id={chartId}
            options={options}
            data={initialChartData}
            onCreate={handleCreate}
          />
        );
      }}
    </AutoSizer>
  );
}

const MPlot = memo(Plot);
